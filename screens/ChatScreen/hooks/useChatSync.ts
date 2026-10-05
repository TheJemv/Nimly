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

// Exported so `useIncomingMessageCache` can fetch a reply's joined preview the
// same way this file does, and cache an identically-shaped row.
export const REPLY_SELECT = `
    *,
    reply_to:reply_to_id (id, content, sender_id, type),
    reply_to_story:reply_to_story_id (id, media_url, user_id, media_type)
`;

export type SendResult = { ok: true } | { ok: false; reason: "invalid" | "no-key" | "send-failed" };

type MessageCursor = { created_at: string; id: string } | null;

// How far back a sync pages to close the hole left by a long absence before
// giving up and starting over from the newest messages.
const MAX_SYNC_PAGES = 5;

const toCursor = (m: any): NonNullable<MessageCursor> => ({ created_at: m.created_at, id: m.id });
const timeOf = (m: any): number => new Date(m.created_at).getTime();

/** Row filter for the history cutoff: optimistic bubbles, or rows at/after it. */
const atOrAfter = (cutoff: string) => {
    const t = new Date(cutoff).getTime();
    return (m: any) => Boolean(m.__status) || timeOf(m) >= t;
};

/** One page of messages, newest first, strictly older than `cursor`. */
async function fetchPage(cId: string, cursor: MessageCursor, cutoff: string | null): Promise<any[]> {
    let query = supabase
        .from('messages')
        .select(REPLY_SELECT)
        .eq('chat_id', cId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });
    if (cutoff) query = query.gte('created_at', cutoff);
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
    return data || [];
}

/**
 * Merges a sync of the latest messages (on open, on foreground, on realtime
 * rejoin) into whatever's already showing: patches fields on rows we already
 * have, adds ones we don't. Never removes a row just because it's absent from
 * `fresh` — `fresh` is a window, not the full list, so absence doesn't mean
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
    // Newest message known to be contiguous with the loaded history: everything
    // from it down to the oldest loaded row has been fetched. A sync pages back
    // until it reaches it, so a long absence can't leave a hole mid-thread.
    const syncedThroughRef = useRef<MessageCursor>(null);
    // Realtime has been live without interruption since the last sync: only
    // then is an incoming INSERT contiguous (and can move `syncedThroughRef`).
    const liveSinceSyncRef = useRef(false);
    const channelLiveRef = useRef(false);
    // Sync serialization: one at a time; a request made meanwhile runs after.
    const syncInFlightRef = useRef(false);
    const nextSyncRef = useRef<string | null>(null);
    // Latest rendered list, for decisions taken outside a setMessages updater.
    const messagesRef = useRef<any[]>(messages);
    messagesRef.current = messages;

    // Mark messages as read
    const markMessagesAsRead = useCallback(async (cId: string) => {
        if (!targetFriendId) return;
        await chatApi.markAsRead(cId, targetFriendId);
    }, [targetFriendId]);

    /** Pagination: the page right below `cursor` (the oldest loaded row). */
    const fetchOlderMessages = useCallback(async (cId: string, cursor: NonNullable<MessageCursor>) => {
        try {
            const fetchedData = await fetchPage(cId, cursor, cutoffRef.current);
            if (fetchedData.length < PAGE_SIZE) setHasMore(false);

            // Decrypt BEFORE rendering: no "Decrypting…" flash, no jumps.
            await hydrateTextMessages(fetchedData, pubKeyRef.current);

            setMessages(prev => [...prev, ...fetchedData]);
        } catch (e) {
            console.error('❌ [FETCH] Error:', e);
        }
    }, []);

    /**
     * Brings in the newest messages and merges them into what's showing. Pages
     * back from the newest until it reaches `syncedThroughRef`, so whatever
     * arrived while we weren't listening (a cache from days ago, a while in
     * the background) is fetched in full — not just the latest page with a
     * hole of never-fetched messages below it. If the hole is bigger than
     * MAX_SYNC_PAGES it starts over from the newest messages instead, and the
     * older history reloads through normal pagination.
     */
    const syncLatest = useCallback(async (cId: string) => {
        const anchor = syncedThroughRef.current;
        let collected: any[] = [];
        let cursor: MessageCursor = null;
        let reachedEnd = false;
        let reachedAnchor = false;

        for (let i = 0; i < MAX_SYNC_PAGES; i++) {
            const page = await fetchPage(cId, cursor, cutoffRef.current);
            collected = collected.concat(page);
            if (page.length < PAGE_SIZE) { reachedEnd = true; break; }
            if (!anchor) break;
            const oldest = page[page.length - 1];
            if (timeOf(oldest) <= timeOf(anchor)) { reachedAnchor = true; break; }
            cursor = toCursor(oldest);
        }

        // Decrypt BEFORE rendering: no "Decrypting…" flash, no jumps.
        await hydrateTextMessages(collected, pubKeyRef.current);

        const shown = messagesRef.current;
        const known = new Set(shown.map((m) => m.id));
        const addedFromFriend = collected.some((m) => !known.has(m.id) && m.sender_id === targetFriendId);
        // Without an anchor we can't tell whether what's showing (e.g. an older
        // cache) connects to the newest page, so that also starts over.
        const contiguous = reachedEnd || reachedAnchor || !shown.some((m) => !m.__status);

        if (collected.length > 0) syncedThroughRef.current = toCursor(collected[0]);

        const fetchedIds = new Set(collected.map((m) => m.id));
        if (contiguous) {
            setMessages((prev) => reconcileMessages(prev, collected));
            // Cached reserve rows inside the range just fetched are either in
            // `collected` already or were deleted: revealing them later would
            // duplicate or resurrect them.
            if (collected.length > 0) {
                const oldestFetched = timeOf(collected[collected.length - 1]);
                cacheReserveRef.current = cacheReserveRef.current.filter(
                    (m) => timeOf(m) < oldestFetched || (timeOf(m) === oldestFetched && !fetchedIds.has(m.id))
                );
            }
        } else {
            const newestFetched = collected.length > 0 ? timeOf(collected[0]) : 0;
            // Keep the optimistic bubbles and anything realtime delivered after this fetch.
            setMessages((prev) => [
                ...prev.filter((m) => !fetchedIds.has(m.id) && (m.__status || timeOf(m) > newestFetched)),
                ...collected,
            ]);
            cacheReserveRef.current = [];
            cacheHasMoreRef.current = true;
            setHasMore(true);
        }

        if (reachedEnd) {
            setHasMore(false);
            // The whole history fits in what we just fetched: any leftover
            // cached reserve beyond it must be stale (deleted).
            cacheReserveRef.current = [];
        }

        if (addedFromFriend) markMessagesAsRead(cId);
    }, [targetFriendId, markMessagesAsRead]);

    /** Runs syncLatest one at a time; a request made meanwhile runs right after. */
    const requestSync = useCallback(async (cId: string) => {
        // Not before init has the history cutoff and owns the message state.
        if (!networkOwnsStateRef.current) return;
        nextSyncRef.current = cId;
        if (syncInFlightRef.current) return;

        syncInFlightRef.current = true;
        let ok = false;
        try {
            while (nextSyncRef.current) {
                const id = nextSyncRef.current;
                nextSyncRef.current = null;
                try {
                    await syncLatest(id);
                    ok = true;
                } catch (e) {
                    ok = false;
                    console.error('❌ [SYNC] Error:', e);
                }
            }
        } finally {
            syncInFlightRef.current = false;
        }
        liveSinceSyncRef.current = ok && channelLiveRef.current;
    }, [syncLatest]);

    // When returning to the foreground: reopen the channel (nonce) + fetch what was missed.
    useAppForeground(() => {
        // The socket may have died silently while in the background.
        liveSinceSyncRef.current = false;
        setResyncNonce((n) => n + 1);
        if (chatId) requestSync(chatId);
    });

    useEffect(() => {
        let isMounted = true;
        // Reset in case this hook instance is being reused for a different chat.
        cacheReserveRef.current = [];
        cacheHasMoreRef.current = true;
        networkOwnsStateRef.current = false;
        syncedThroughRef.current = null;
        liveSinceSyncRef.current = false;

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

                // init may already know the history cutoff: nothing older can be decrypted.
                const keep = cutoffRef.current ? atOrAfter(cutoffRef.current) : () => true;
                cacheReserveRef.current = cacheReserveRef.current.filter(keep);
                syncedThroughRef.current = cached.syncedThrough;
                setMessages(firstPage.filter(keep));
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
                // and when the contact published their current key (the server's
                // `public_key_updated_at`). Nothing older can be decrypted here, so it's
                // never requested — on EVERY open, not just the one that detects a change.
                const myRotatedAt = await identityRotation.rotatedAt();
                const friendKeyAt: string | null = profRes.data?.public_key_updated_at ?? null;
                let friendKeyChangedAt: string | null = null;

                if (isMounted && profRes.data) {
                    setFriendProfile(profRes.data);
                    const rec = await contactKeys.record(targetFriendId, profRes.data.public_key ?? null);
                    if (isMounted) setFriendKeyChanged(rec.changed);
                    friendKeyChangedAt = rec.changedAt;
                }

                const cutoffTime = Math.max(
                    myRotatedAt ? new Date(myRotatedAt).getTime() : 0,
                    friendKeyAt ? new Date(friendKeyAt).getTime() : 0,
                );
                const cutoff = cutoffTime > 0 ? new Date(cutoffTime).toISOString() : null;
                cutoffRef.current = cutoff;
                // The "messages before X aren't available" notice only when keys
                // actually changed (mine, or theirs as seen from this device): a
                // contact's first key also has a date, and nothing was lost then.
                if (isMounted) setMessageCutoff(myRotatedAt || friendKeyChangedAt ? cutoff : null);

                // Rows the disk cache kept from before the cutoff can't be decrypted
                // either: drop them instead of showing-and-hiding them every time.
                if (cutoff) {
                    const keep = atOrAfter(cutoff);
                    cacheReserveRef.current = cacheReserveRef.current.filter(keep);
                    if (isMounted) setMessages((prev) => prev.filter(keep));
                }

                await markMessagesAsRead(cId);
                // From here on, network owns message state — the cache-seed flow
                // above must not overwrite whatever this reconcile is about to set.
                networkOwnsStateRef.current = true;
                await requestSync(cId);
            } catch (e) {
                console.error("❌ [INIT] Chat Init Error:", e);
                Sentry.captureException(e, { tags: { area: 'chat-init' } });
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        init();
        return () => { isMounted = false; };
    }, [targetFriendId, routeUserPublicKey, markMessagesAsRead, requestSync]);

    // Keep the key fresh if the profile arrives/changes after init.
    useEffect(() => {
        pubKeyRef.current = friendProfile?.public_key ?? routeUserPublicKey;
    }, [friendProfile?.public_key, routeUserPublicKey]);

    useEffect(() => {
        if (!chatId) return;
        // Status callbacks from a channel already being torn down must not
        // touch the live flags of its replacement.
        let active = true;
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

                            // Live without gaps since the last sync → nothing can be
                            // missing below this row, so syncs can start from here.
                            const anchor = syncedThroughRef.current;
                            if (liveSinceSyncRef.current && (!anchor || timeOf(finalMsg) > timeOf(anchor))) {
                                syncedThroughRef.current = toCursor(finalMsg);
                            }

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
            .subscribe((status) => {
                if (!active) return;
                channelLiveRef.current = status === 'SUBSCRIBED';
                if (status === 'SUBSCRIBED') {
                    // (Re)joined — first time, after a network blip, or after the
                    // foreground resync: fetch whatever arrived while not listening.
                    requestSync(chatId);
                } else {
                    liveSinceSyncRef.current = false;
                }
            });

        return () => {
            active = false;
            channelLiveRef.current = false;
            liveSinceSyncRef.current = false;
            supabase.removeChannel(channel);
        };
    }, [chatId, targetFriendId, markMessagesAsRead, resyncNonce, requestSync]);

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
            syncedThrough: syncedThroughRef.current,
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
            await fetchOlderMessages(chatId, toCursor(oldest));
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