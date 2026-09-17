import { chatApi } from "@/api/chat";
import { useAppForeground } from "@/hooks/useAppForeground";
import { supabase } from "@/lib/supabase";
import { getCachedMessages, scheduleCacheWrite } from "@/utils/chatMessageCache";
import { cleanChatMessage } from "@/utils/chatUtils";
import { contactKeys, identityRotation, vaultCrypto, vaultRAMCache } from "@/utils/crypto";
import * as Sentry from "@sentry/react-native";
import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";

const PAGE_SIZE = 30;

const REPLY_SELECT = `
    *,
    reply_to:reply_to_id (id, content, sender_id, type),
    reply_to_story:reply_to_story_id (id, media_url, user_id, media_type)
`;

export type SendResult = { ok: true } | { ok: false; reason: "invalid" | "no-key" | "send-failed" };

type MessageCursor = { created_at: string; id: string } | null;

/**
 * Merges a "latest N" fetch (reconcile-on-open, catch-up-on-foreground) into
 * whatever's already showing: patches fields on rows we already have, adds
 * ones we don't. Never removes a row just because it's absent from `fresh` —
 * `fresh` is a fixed-size window, not the full list, so absence doesn't mean
 * "deleted" (that's handled separately by the realtime DELETE event).
 */
function reconcileMessages(prev: any[], fresh: any[]) {
    const byId = new Map(fresh.map((m) => [m.id, m]));
    const missing = fresh.filter((m) => !prev.some((p) => p.id === m.id));
    const reconciled = prev.map((m) => (byId.has(m.id) && !m.__status ? { ...m, ...byId.get(m.id) } : m));
    if (missing.length === 0) return reconciled;
    return [...missing, ...reconciled].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
}

const isPlainTextMsg = (m: any) =>
    (m.type === 'text' || !m.type) && !!m.content && m.content !== 'OPENED_CAPSULE';

/**
 * Decrypts the text of a batch of messages in parallel and warms it into the
 * RAM cache BEFORE rendering them. This way every bubble renders at its final
 * height right away — no "Decrypting…" flash, no scroll jumps when paginating.
 */
async function hydrateTextMessages(rows: any[], friendPublicKey: string | undefined) {
    if (!friendPublicKey || rows.length === 0) return;
    await Promise.all(
        rows.map(async (m) => {
            if (!isPlainTextMsg(m)) return;
            const cached = vaultRAMCache[m.content];
            if (cached && !cached.startsWith('🔒')) return;
            try {
                const clear = await vaultCrypto.decryptMessage(m.content, friendPublicKey);
                if (!clear.startsWith('🔒')) vaultRAMCache[m.content] = clear;
            } catch { /* caught by the undecryptable probe */ }
        })
    );
}

export function useChatSync(targetFriendId: string | undefined, routeUserPublicKey?: string) {
    const [chatId, setChatId] = useState<string | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [friendProfile, setFriendProfile] = useState<any>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    // true if the contact's public key changed compared to the last one seen on this device
    const [friendKeyChanged, setFriendKeyChanged] = useState(false);
    // The point in time from which this device CAN decrypt in this chat:
    // whichever is more recent between my identity rotation and the contact's key rotation.
    // Nothing older is requested from the server (it couldn't be read anyway).
    const [messageCutoff, setMessageCutoff] = useState<string | null>(null);
    const cutoffRef = useRef<string | null>(null);
    // Incremented when returning from the background to force the realtime
    // channel to reconnect (iOS kills the WebSocket while the app is backgrounded).
    const [resyncNonce, setResyncNonce] = useState(0);
    // Last known public key of the contact, used to decrypt when paginating / in realtime.
    const pubKeyRef = useRef<string | undefined>(routeUserPublicKey);
    // Messages already cached on disk for this chat but not yet revealed into
    // `messages` — revealed one PAGE_SIZE chunk at a time as the user scrolls,
    // so pagination feels identical whether it's serving cache or network.
    const cacheReserveRef = useRef<any[]>([]);
    // Whether the *server* has more messages beyond what was cached last session.
    const cacheHasMoreRef = useRef(true);
    // Set once the network init flow starts delivering its own first page —
    // tells the cache-seed flow (which can resolve later on an unusually slow
    // disk / fast network) to back off instead of clobbering fresher data.
    const networkOwnsStateRef = useRef(false);

    // Mark messages as read
    const markMessagesAsRead = useCallback(async (cId: string) => {
        if (!targetFriendId) return;
        await chatApi.markAsRead(cId, targetFriendId);
    }, [targetFriendId]);

    const fetchMessages = useCallback(async (cId: string, cursor: MessageCursor, keyOverride?: string) => {
        try {
            let query = supabase
                .from('messages')
                .select(REPLY_SELECT)
                .eq('chat_id', cId)
                .order('created_at', { ascending: false })
                .order('id', { ascending: false });
            if (cutoffRef.current) query = query.gte('created_at', cutoffRef.current);
            // Keyset pagination: strictly older than the last row we have. Unlike an
            // offset, this can't skip/duplicate a row if something was deleted in
            // between pages. `id` only breaks ties on an identical `created_at`.
            if (cursor) {
                query = query.or(
                    `created_at.lt."${cursor.created_at}",and(created_at.eq."${cursor.created_at}",id.lt."${cursor.id}")`
                );
            }

            const { data, error } = await query.limit(PAGE_SIZE);

            if (error) throw error;

            const fetchedData = data || [];

            if (fetchedData.length < PAGE_SIZE) {
                setHasMore(false);
                // The server-authoritative "latest page" fits in one page: any
                // leftover cached reserve beyond it must be stale (deleted).
                if (!cursor) cacheReserveRef.current = [];
            }

            // Decrypt BEFORE rendering: no "Decrypting…" flash, no jumps.
            await hydrateTextMessages(fetchedData, keyOverride ?? pubKeyRef.current);

            setMessages(prev => (cursor ? [...prev, ...fetchedData] : reconcileMessages(prev, fetchedData)));

            return fetchedData;
        } catch (e) {
            console.error('❌ [FETCH] Error:', e);
        }
    }, []);

    // Fetches the most recent messages and merges in any that are missing, without touching
    // pagination or the optimistic bubbles. Used when returning from the background.
    const catchUpMessages = useCallback(async (cId: string) => {
        try {
            let query = supabase
                .from('messages')
                .select(REPLY_SELECT)
                .eq('chat_id', cId)
                .order('created_at', { ascending: false });
            if (cutoffRef.current) query = query.gte('created_at', cutoffRef.current);

            const { data } = await query.limit(PAGE_SIZE);

            if (!data || data.length === 0) return;

            await hydrateTextMessages(data, pubKeyRef.current);

            let addedFromFriend = false;
            setMessages((prev) => {
                const known = new Set(prev.map((m) => m.id));
                addedFromFriend = data.some((m) => !known.has(m.id) && m.sender_id === targetFriendId);
                return reconcileMessages(prev, data);
            });

            if (addedFromFriend) markMessagesAsRead(cId);
        } catch (e) {
            console.error('❌ [CATCHUP] Error:', e);
        }
    }, [targetFriendId, markMessagesAsRead]);

    // When returning to the foreground: reopen the channel (nonce) + fetch what was missed.
    useAppForeground(() => {
        setResyncNonce((n) => n + 1);
        if (chatId) catchUpMessages(chatId);
    });

    useEffect(() => {
        let isMounted = true;
        // Reset in case this hook instance is being reused for a different chat.
        cacheReserveRef.current = [];
        cacheHasMoreRef.current = true;
        networkOwnsStateRef.current = false;

        // Renders instantly from disk, fully independent of the auth/chat-id
        // network round trips in `init` below — keyed by `targetFriendId`
        // (known synchronously from route params) rather than the internal
        // chat id (which needs a network round trip via `getOrCreateChat` to
        // resolve), so this doesn't wait on anything. If `init` gets there
        // first (slow disk / very fast network), it backs off instead of
        // clobbering fresher data.
        if (targetFriendId && targetFriendId !== "[id]") {
            (async () => {
                const cached = await getCachedMessages(targetFriendId);
                if (!isMounted || networkOwnsStateRef.current || !cached || cached.messages.length === 0) return;

                // Bubble side is `sender_id === currentUserId` — resolve it
                // BEFORE revealing messages below, or every bubble (including
                // our own) renders as "theirs" for a frame, then flips. The
                // cache already stored who was signed in when it was written,
                // so this is normally instant — zero async calls. Only if an
                // older/corrupt cache is missing it do we fall back to the
                // local session (still no network round trip).
                let uid = cached.currentUserId;
                if (!uid) {
                    const { data: { session } } = await supabase.auth.getSession();
                    uid = session?.user?.id ?? null;
                }
                if (!isMounted || networkOwnsStateRef.current) return;
                if (uid) setCurrentUserId(uid);

                const firstPage = cached.messages.slice(0, PAGE_SIZE);
                cacheReserveRef.current = cached.messages.slice(PAGE_SIZE);
                cacheHasMoreRef.current = cached.hasMore;
                await hydrateTextMessages(firstPage, pubKeyRef.current);
                if (!isMounted || networkOwnsStateRef.current) return;

                setMessages(firstPage);
                setHasMore(cacheReserveRef.current.length > 0 || cached.hasMore);
                setLoading(false);
            })();
        }

        const init = async () => {
            if (!targetFriendId || targetFriendId === "[id]") return;
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;
                if (isMounted) setCurrentUserId(user.id);

                // The profile (and its public key) doesn't depend on chatId, so they run
                // in parallel. We need the key to decrypt before rendering.
                const [cId, profRes] = await Promise.all([
                    chatApi.getOrCreateChat(targetFriendId),
                    // maybeSingle: if the profile doesn't exist yet we don't want it to throw and
                    // leave the chat stuck; `routeUser` is used as a fallback.
                    supabase.from('profiles').select('*').eq('id', targetFriendId).maybeSingle(),
                ]);
                if (!cId) return;
                if (isMounted) setChatId(cId);

                const pubKey = profRes.data?.public_key ?? routeUserPublicKey;
                pubKeyRef.current = pubKey;

                // History cutoff: whichever is more recent between MY identity rotation
                // and the contact's key rotation. For the contact we use the server's
                // `public_key_updated_at` (when they published their current key),
                // not when we detected it here.
                const myRotatedAt = await identityRotation.rotatedAt();
                let friendRotatedAt: string | null = null;

                if (isMounted && profRes.data) {
                    setFriendProfile(profRes.data);
                    const rec = await contactKeys.record(targetFriendId, profRes.data.public_key ?? null);
                    if (isMounted) setFriendKeyChanged(rec.changed);
                    if (rec.changed) friendRotatedAt = profRes.data.public_key_updated_at ?? rec.firstSeenAt;
                }

                const cutoff = [myRotatedAt, friendRotatedAt].filter(Boolean).sort().pop() as string | undefined;
                cutoffRef.current = cutoff ?? null;
                if (isMounted) setMessageCutoff(cutoff ?? null);

                await markMessagesAsRead(cId);
                // From here on, network owns message state — the cache-seed flow
                // above must not overwrite whatever this reconcile is about to set.
                networkOwnsStateRef.current = true;
                await fetchMessages(cId, null, pubKey);
            } catch (e) {
                console.error("❌ [INIT] Chat Init Error:", e);
                Sentry.captureException(e, { tags: { area: 'chat-init' } });
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        init();
        return () => { isMounted = false; };
    }, [targetFriendId, routeUserPublicKey, markMessagesAsRead, fetchMessages]);

    // Keep the key fresh if the profile arrives/changes after init.
    useEffect(() => {
        pubKeyRef.current = friendProfile?.public_key ?? routeUserPublicKey;
    }, [friendProfile?.public_key, routeUserPublicKey]);

    useEffect(() => {
        if (!chatId) return;
        const uniqueChannelId = `chat:${chatId}-${Date.now()}`;
        const channel = supabase.channel(uniqueChannelId)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
                (payload) => {
                    if (payload.eventType === 'INSERT') {
                        const rawMsg = payload.new;
                        // Echo of our own message that we already rendered in gray: the
                        // optimistic bubble uses client_id as a temporary id.
                        const clientId: string | null = rawMsg.client_id ?? null;

                        const handleNewMessage = async () => {
                            let finalMsg = rawMsg;

                            // The realtime payload only carries the ids (reply_to_id /
                            // reply_to_story_id), not the relations. Without re-fetching
                            // the row with the join, a reply to a story would arrive without
                            // its preview, requiring leaving/re-entering the chat to see it.
                            if (rawMsg.reply_to_id || rawMsg.reply_to_story_id) {
                                const { data } = await supabase
                                    .from('messages')
                                    .select(REPLY_SELECT)
                                    .eq('id', rawMsg.id)
                                    .single();

                                if (data) finalMsg = data;
                            }

                            // Decrypt before rendering so it doesn't show up empty.
                            await hydrateTextMessages([finalMsg], pubKeyRef.current);

                            setMessages((prev) => {
                                const hasTemp = clientId != null && prev.some((m) => m.id === clientId);
                                if (prev.some((m) => m.id === finalMsg.id)) {
                                    return hasTemp ? prev.filter((m) => m.id !== clientId) : prev;
                                }
                                if (hasTemp) {
                                    return prev.map((m) => (m.id === clientId ? finalMsg : m));
                                }
                                return [finalMsg, ...prev];
                            });

                            if (targetFriendId && finalMsg.sender_id === targetFriendId) {
                                markMessagesAsRead(chatId);
                            }
                        };

                        handleNewMessage();

                    } else if (payload.eventType === 'UPDATE') {
                        const updatedMsg = payload.new;
                        setMessages((prev) =>
                            prev.map((m) => (m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m))
                        );
                    } else if (payload.eventType === 'DELETE') {
                        const deletedId = payload.old.id;
                        setMessages((prev) => prev.filter((m) => m.id !== deletedId));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [chatId, targetFriendId, markMessagesAsRead, resyncNonce]);

    // Write-through to disk: any change to the loaded list (pagination, realtime,
    // optimistic send, reconciliation) gets mirrored to cache, debounced. Also
    // covers whatever's still sitting in the unrevealed cache reserve, so a
    // session that never scrolls back down to it doesn't drop it from disk.
    useEffect(() => {
        if (!targetFriendId || targetFriendId === "[id]") return;
        scheduleCacheWrite(targetFriendId, {
            messages: [...messages, ...cacheReserveRef.current],
            hasMore: cacheReserveRef.current.length > 0 || hasMore,
            currentUserId,
        });
    }, [targetFriendId, messages, hasMore, currentUserId]);

    const loadMoreMessages = async () => {
        if (loadingMore || !hasMore || !chatId) return;
        setLoadingMore(true);
        try {
            // Serve already-cached-but-unrevealed messages first, one page at a
            // time, before ever touching the network.
            if (cacheReserveRef.current.length > 0) {
                const nextChunk = cacheReserveRef.current.slice(0, PAGE_SIZE);
                cacheReserveRef.current = cacheReserveRef.current.slice(PAGE_SIZE);
                await hydrateTextMessages(nextChunk, pubKeyRef.current);
                setMessages(prev => [...prev, ...nextChunk]);
                if (cacheReserveRef.current.length === 0 && !cacheHasMoreRef.current) {
                    setHasMore(false);
                }
                return;
            }

            const oldest = messages[messages.length - 1];
            if (!oldest) return;
            await fetchMessages(chatId, { created_at: oldest.created_at, id: oldest.id });
        } finally {
            setLoadingMore(false);
        }
    };

    /**
     * Optimistic text send: renders the bubble instantly (in gray, "sending"
     * state), encrypts + saves it to the backend, then reconciles the temporary
     * copy with the real row (via realtime or the insert response, whichever
     * arrives first). If something fails, the bubble stays marked as "failed".
     *
     * The temp <-> real row correlation is done via `client_id` (a uuid generated
     * on the client, with a unique index on the table). Retrying reuses the same
     * client_id, so the unique index makes the send idempotent: if a previous
     * attempt did go through, the upsert won't duplicate it and we just fetch that row.
     */
    const sendText = useCallback(
        async (
            plainText: string,
            friendPublicKey: string | undefined,
            replyTo: any | null,
            existingClientId?: string
        ): Promise<SendResult> => {
            const text = cleanChatMessage(plainText);
            if (!text || !chatId || !currentUserId) return { ok: false, reason: "invalid" };
            if (!friendPublicKey) return { ok: false, reason: "no-key" };

            const clientId = existingClientId ?? randomUUID();
            const replyToId = replyTo?.id ?? null;

            const optimistic = {
                id: clientId,
                client_id: clientId,
                chat_id: chatId,
                sender_id: currentUserId,
                content: text,
                type: "text",
                is_read: false,
                created_at: new Date().toISOString(),
                reply_to_id: replyToId,
                reply_to: replyTo
                    ? { id: replyTo.id, content: replyTo.content, sender_id: replyTo.sender_id, type: replyTo.type ?? null }
                    : null,
                reply_to_story: null,
                __status: "sending" as const,
                __plain: text,
            };

            // New message -> prepended; retry -> goes back to "sending" in place.
            setMessages((prev) =>
                prev.some((m) => m.id === clientId)
                    ? prev.map((m) => (m.id === clientId ? { ...m, __status: "sending" as const } : m))
                    : [optimistic, ...prev]
            );

            try {
                const encryptedContent = await vaultCrypto.encryptMessage(text, friendPublicKey);
                if (!encryptedContent) throw new Error("Encryption failed");

                vaultRAMCache[encryptedContent] = text;

                let { data, error } = await supabase
                    .from("messages")
                    .upsert(
                        {
                            chat_id: chatId,
                            sender_id: currentUserId,
                            content: encryptedContent,
                            type: "text",
                            is_read: false,
                            reply_to_id: replyToId,
                            client_id: clientId,
                        },
                        { onConflict: "client_id", ignoreDuplicates: true }
                    )
                    .select(REPLY_SELECT)
                    .maybeSingle();

                // No row returned => it already existed (a previous attempt got through): fetch it.
                if (!error && !data) {
                    ({ data, error } = await supabase
                        .from("messages")
                        .select(REPLY_SELECT)
                        .eq("client_id", clientId)
                        .maybeSingle());
                }

                if (error) throw error;
                if (!data) throw new Error("Insert returned no row");

                const real = data;
                // Realtime may have already done the swap; avoid duplicates.
                setMessages((prev) => {
                    const hasTemp = prev.some((m) => m.id === clientId);
                    if (prev.some((m) => m.id === real.id)) {
                        return hasTemp ? prev.filter((m) => m.id !== clientId) : prev;
                    }
                    return hasTemp
                        ? prev.map((m) => (m.id === clientId ? real : m))
                        : [real, ...prev];
                });

                return { ok: true };
            } catch (e) {
                console.error("❌ [SEND] Vault Send Error:", e);
                Sentry.captureException(e, { tags: { area: 'chat-send' } });
                setMessages((prev) =>
                    prev.map((m) => (m.id === clientId ? { ...m, __status: "failed" as const } : m))
                );
                return { ok: false, reason: "send-failed" };
            }
        },
        [chatId, currentUserId]
    );

    return {
        chatId,
        messages,
        setMessages,
        loading,
        loadingMore,
        hasMore,
        friendProfile,
        friendKeyChanged,
        messageCutoff,
        currentUserId,
        loadMoreMessages,
        markMessagesAsRead,
        sendText
    };
}