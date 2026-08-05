import { chatApi } from "@/api/chat";
import { supabase } from "@/lib/supabase";
import { useCallback, useEffect, useState } from "react";

const PAGE_SIZE = 30;
export function useChatSync(targetFriendId: string | undefined) {
    const [chatId, setChatId] = useState<string | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [friendProfile, setFriendProfile] = useState<any>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    // Marcar mensajes como leídos
    const markMessagesAsRead = useCallback(async (cId: string) => {
        if (!targetFriendId) return;
        await chatApi.markAsRead(cId, targetFriendId);
    }, [targetFriendId]);

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

                const [_, profRes] = await Promise.all([
                    fetchMessages(cId, 0),
                    supabase.from('profiles').select('*').eq('id', targetFriendId).single()
                ]);

                if (isMounted && profRes.data) {
                    setFriendProfile(profRes.data);
                }
            } catch (e) {
                console.error("❌ [INIT] Chat Init Error:", e);
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        init();
        return () => { isMounted = false; };
    }, [targetFriendId, markMessagesAsRead]);

    const fetchMessages = async (cId: string, offset: number) => {
        try {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('chat_id', cId)
                .order('created_at', { ascending: false })
                .range(offset, offset + PAGE_SIZE - 1);

            if (error) throw error;
            if (data && data.length < PAGE_SIZE) setHasMore(false);
            
            setMessages(prev => offset === 0 ? (data || []) : [...prev, ...(data || [])]);
            return data;
        } catch (e) {
            console.error('❌ [FETCH] Error:', e);
        }
    };

    useEffect(() => {
        if (!chatId) return;
        const uniqueChannelId = `chat:${chatId}-${Date.now()}`;
        const channel = supabase.channel(uniqueChannelId)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
                (payload) => {
                    if (payload.eventType === 'INSERT') {
                        const newMsg = payload.new;
                        setMessages((prev) => {
                            if (prev.some((m) => m.id === newMsg.id)) return prev;
                            return [newMsg, ...prev];
                        });
                        if (targetFriendId && newMsg.sender_id === targetFriendId) {
                            markMessagesAsRead(chatId);
                        }
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

    return {
        chatId,
        messages,
        setMessages,
        loading,
        loadingMore,
        hasMore,
        friendProfile,
        currentUserId,
        loadMoreMessages,
        markMessagesAsRead
    };
}