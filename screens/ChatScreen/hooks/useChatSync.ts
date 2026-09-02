import { chatApi } from "@/api/chat";
import { supabase } from "@/lib/supabase";
import { cleanChatMessage } from "@/utils/chatUtils";
import { contactKeys, vaultCrypto, vaultRAMCache } from "@/utils/crypto";
import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useState } from "react";

const PAGE_SIZE = 30;

const REPLY_SELECT = `
    *,
    reply_to:reply_to_id (id, content, sender_id, type),
    reply_to_story:reply_to_story_id (id, media_url, user_id)
`;

export type SendResult = { ok: true } | { ok: false; reason: "invalid" | "no-key" | "send-failed" };

export function useChatSync(targetFriendId: string | undefined) {
    const [chatId, setChatId] = useState<string | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [friendProfile, setFriendProfile] = useState<any>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    // true si la public key del contacto cambió respecto a la última vista en este dispositivo
    const [friendKeyChanged, setFriendKeyChanged] = useState(false);

    // Marcar mensajes como leídos
    const markMessagesAsRead = useCallback(async (cId: string) => {
        if (!targetFriendId) return;
        await chatApi.markAsRead(cId, targetFriendId);
    }, [targetFriendId]);

    const fetchMessages = useCallback(async (cId: string, offset: number) => {
        try {
            const { data, error } = await supabase
                .from('messages')
                .select(`
                    *,
                    reply_to:reply_to_id (id, content, sender_id, type),
                    reply_to_story:reply_to_story_id (id, media_url, user_id)
                `)
                .eq('chat_id', cId)
                .order('created_at', { ascending: false })
                .range(offset, offset + PAGE_SIZE - 1);

            if (error) throw error;

            const fetchedData = data || [];

            if (fetchedData.length < PAGE_SIZE) {
                setHasMore(false);
            }

            setMessages(prev => offset === 0 ? fetchedData : [...prev, ...fetchedData]);
            
            return fetchedData;
        } catch (e) {
            console.error('❌ [FETCH] Error:', e);
        }
    }, []);

    useEffect(() => {
        let isMounted = true;
        const init = async () => {
            if (!targetFriendId || targetFriendId === "[id]") return;
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;
                if (isMounted) setCurrentUserId(user.id);

                const cId = await chatApi.getOrCreateChat(targetFriendId);
                if (!cId) return;
                if (isMounted) setChatId(cId);

                await markMessagesAsRead(cId);

                const [, profRes] = await Promise.all([
                    fetchMessages(cId, 0),
                    // maybeSingle: si el perfil aún no existe no queremos que lance y
                    // deje el chat bloqueado; se usa `routeUser` como respaldo.
                    supabase.from('profiles').select('*').eq('id', targetFriendId).maybeSingle()
                ]);

                if (isMounted && profRes.data) {
                    setFriendProfile(profRes.data);

                    // Detección local de cambio de llave (estilo "safety number changed").
                    const { changed } = await contactKeys.record(targetFriendId, profRes.data.public_key ?? null);
                    if (isMounted) setFriendKeyChanged(changed);
                }
            } catch (e) {
                console.error("❌ [INIT] Chat Init Error:", e);
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        init();
        return () => { isMounted = false; };
    }, [targetFriendId, markMessagesAsRead, fetchMessages]);

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
    }, [chatId, targetFriendId, markMessagesAsRead]);

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
        currentUserId,
        loadMoreMessages,
        markMessagesAsRead,
        sendText
    };
}