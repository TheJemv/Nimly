import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';

export function useChatsList() {
    const [chats, setChats] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [myId, setMyId] = useState<string | null>(null);

    const fetchChats = async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setMyId(user.id);

            const { data, error } = await supabase
                .from('chat_participants')
                .select(`
                    chat_id,
                    chats (
                        id,
                        created_at,
                        messages (content, created_at, sender_id, type, is_read)
                    ),
                    profiles:user_id (id, username, avatar_config, avatar_url, public_key)
                `)
                .neq('user_id', user.id);

            if (error) throw error;

            const sorted = (data || []).sort((a: any, b: any) => {
                const aMessages = a.chats?.messages || [];
                const bMessages = b.chats?.messages || [];
                const lastMsgA = aMessages[aMessages.length - 1];
                const lastMsgB = bMessages[bMessages.length - 1];
                const dateA = lastMsgA ? lastMsgA.created_at : a.chats?.created_at;
                const dateB = lastMsgB ? lastMsgB.created_at : b.chats?.created_at;
                return new Date(dateB).getTime() - new Date(dateA).getTime();
            });
            setChats(sorted);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchChats(false);
    };

    useEffect(() => {
        fetchChats();

        const channel = supabase
            .channel('list_updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'messages' },
                () => {
                    if (__DEV__) console.log('🔄 [REALTIME] Cambio detectado en mensajes, actualizando lista...');
                    fetchChats(false);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    return { chats, loading, refreshing, myId, onRefresh };
}