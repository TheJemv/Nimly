import { chatApi } from "@/api/chat";
import { useAppForeground } from "@/hooks/useAppForeground";
import { supabase } from "@/lib/supabase";
import { cleanChatMessage } from "@/utils/chatUtils";
import { contactKeys, identityRotation, vaultCrypto, vaultRAMCache } from "@/utils/crypto";
import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";

const PAGE_SIZE = 30;

const REPLY_SELECT = `
    *,
    reply_to:reply_to_id (id, content, sender_id, type),
    reply_to_story:reply_to_story_id (id, media_url, user_id)
`;

export type SendResult = { ok: true } | { ok: false; reason: "invalid" | "no-key" | "send-failed" };

const isPlainTextMsg = (m: any) =>
    (m.type === 'text' || !m.type) && !!m.content && m.content !== 'OPENED_CAPSULE';

/**
 * Descifra en paralelo el texto de una tanda de mensajes y lo deja caliente en
 * la RAM cache ANTES de pintarlos. Así cada burbuja se renderiza ya con su
 * altura final: no hay "Decrypting…", ni saltos de scroll al paginar.
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
            } catch { /* lo detecta el probe de undecryptable */ }
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
    // true si la public key del contacto cambió respecto a la última vista en este dispositivo
    const [friendKeyChanged, setFriendKeyChanged] = useState(false);
    // Instante desde el cual este dispositivo SÍ puede descifrar en este chat:
    // el más reciente entre mi rotación de identidad y la rotación del contacto.
    // Nada anterior se pide al servidor (no se puede leer de todos modos).
    const [messageCutoff, setMessageCutoff] = useState<string | null>(null);
    const cutoffRef = useRef<string | null>(null);
    // Se incrementa al volver de segundo plano para forzar la reconexión del
    // canal de realtime (iOS mata el WebSocket mientras la app está fuera).
    const [resyncNonce, setResyncNonce] = useState(0);
    // Última public key conocida del contacto, para descifrar al paginar / en realtime.
    const pubKeyRef = useRef<string | undefined>(routeUserPublicKey);

    // Marcar mensajes como leídos
    const markMessagesAsRead = useCallback(async (cId: string) => {
        if (!targetFriendId) return;
        await chatApi.markAsRead(cId, targetFriendId);
    }, [targetFriendId]);

    const fetchMessages = useCallback(async (cId: string, offset: number, keyOverride?: string) => {
        try {
            let query = supabase
                .from('messages')
                .select(REPLY_SELECT)
                .eq('chat_id', cId)
                .order('created_at', { ascending: false });
            if (cutoffRef.current) query = query.gte('created_at', cutoffRef.current);

            const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);

            if (error) throw error;

            const fetchedData = data || [];

            if (fetchedData.length < PAGE_SIZE) {
                setHasMore(false);
            }

            // Descifrar ANTES de pintar: sin flash de "Decrypting…" ni saltos.
            await hydrateTextMessages(fetchedData, keyOverride ?? pubKeyRef.current);

            setMessages(prev => offset === 0 ? fetchedData : [...prev, ...fetchedData]);

            return fetchedData;
        } catch (e) {
            console.error('❌ [FETCH] Error:', e);
        }
    }, []);

    // Trae los mensajes recientes y fusiona los que falten, sin tocar la
    // paginación ni las burbujas optimistas. Se usa al volver de segundo plano.
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
                const missing = data.filter((m) => !known.has(m.id));
                // Reconcilia también updates (is_read, OPENED_CAPSULE, …) de filas ya conocidas.
                const byId = new Map(data.map((m) => [m.id, m]));
                const reconciled = prev.map((m) => (byId.has(m.id) && !m.__status ? { ...m, ...byId.get(m.id) } : m));
                if (missing.length === 0) return reconciled;

                addedFromFriend = missing.some((m) => m.sender_id === targetFriendId);
                return [...missing, ...reconciled].sort(
                    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                );
            });

            if (addedFromFriend) markMessagesAsRead(cId);
        } catch (e) {
            console.error('❌ [CATCHUP] Error:', e);
        }
    }, [targetFriendId, markMessagesAsRead]);

    // Al volver a primer plano: reabrir canal (nonce) + traer lo que se perdió.
    useAppForeground(() => {
        setResyncNonce((n) => n + 1);
        if (chatId) catchUpMessages(chatId);
    });

    useEffect(() => {
        let isMounted = true;
        const init = async () => {
            if (!targetFriendId || targetFriendId === "[id]") return;
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;
                if (isMounted) setCurrentUserId(user.id);

                // El perfil (y su public key) no depende del chatId, así que van
                // en paralelo. Necesitamos la key para descifrar antes de pintar.
                const [cId, profRes] = await Promise.all([
                    chatApi.getOrCreateChat(targetFriendId),
                    // maybeSingle: si el perfil aún no existe no queremos que lance y
                    // deje el chat bloqueado; se usa `routeUser` como respaldo.
                    supabase.from('profiles').select('*').eq('id', targetFriendId).maybeSingle(),
                ]);
                if (!cId) return;
                if (isMounted) setChatId(cId);

                const pubKey = profRes.data?.public_key ?? routeUserPublicKey;
                pubKeyRef.current = pubKey;

                // Corte de historial: lo más reciente entre MI rotación de identidad
                // y la rotación de llave del contacto. Para el contacto usamos el
                // `public_key_updated_at` del servidor (cuándo publicó su llave
                // actual), no cuándo lo detectamos aquí.
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
                await fetchMessages(cId, 0, pubKey);
            } catch (e) {
                console.error("❌ [INIT] Chat Init Error:", e);
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        init();
        return () => { isMounted = false; };
    }, [targetFriendId, routeUserPublicKey, markMessagesAsRead, fetchMessages]);

    // Mantener la key fresca si el perfil llega/cambia después del init.
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
                        // Eco de un mensaje propio que ya pintamos en gris: la
                        // burbuja optimista usa el client_id como id temporal.
                        const clientId: string | null = rawMsg.client_id ?? null;

                        const handleNewMessage = async () => {
                            let finalMsg = rawMsg;

                            if (rawMsg.reply_to_id) {
                                const { data } = await supabase
                                    .from('messages')
                                    .select(REPLY_SELECT)
                                    .eq('id', rawMsg.id)
                                    .single();

                                if (data) finalMsg = data;
                            }

                            // Descifrar antes de pintar para que no aparezca vacío.
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

    const loadMoreMessages = async () => {
        if (loadingMore || !hasMore || !chatId) return;
        setLoadingMore(true);
        try {
            await fetchMessages(chatId, messages.length);
        } finally {
            setLoadingMore(false);
        }
    };

    /**
     * Envío optimista de texto: pinta la burbuja al instante (en gris, estado
     * "sending"), cifra + guarda en el backend y luego reconcilia la copia
     * temporal con la fila real (por realtime o por la respuesta del insert,
     * lo que llegue primero). Si algo falla la burbuja queda como "failed".
     *
     * La correlación temp <-> fila real es por `client_id` (uuid generado en el
     * cliente, con índice único en la tabla). Reintentar reusa el mismo
     * client_id, así que el índice único hace el envío idempotente: si un
     * intento anterior sí llegó, el upsert no duplica y recuperamos esa fila.
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

            // Alta nueva -> se prepende; reintento -> vuelve a "sending" en su sitio.
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

                // Sin fila devuelta => ya existía (un intento previo sí llegó): la traemos.
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
                // Realtime pudo haber hecho el swap ya; evitamos duplicados.
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