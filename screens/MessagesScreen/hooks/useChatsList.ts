import { supabase } from '@/lib/supabase';
import { debounce } from '@/utils/debounce';
import { useEffect, useRef, useState } from 'react';

const lastMessageTime = (chat: any): number => {
    const msgs: any[] = chat?.chats?.messages || [];
    let newest = chat?.chats?.created_at ? new Date(chat.chats.created_at).getTime() : 0;
    for (const m of msgs) {
        const t = new Date(m.created_at).getTime();
        if (t > newest) newest = t;
    }
    return newest;
};

export function useChatsList() {
    const [chats, setChats] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [myId, setMyId] = useState<string | null>(null);

    const cancelledRef = useRef(false);

    const fetchChats = async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || cancelledRef.current) return;
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
            if (cancelledRef.current) return;

            const normalized = (data || []).map((row: any) => {
                // Ordenamos los mensajes por fecha en el cliente: no dependemos del
                // orden que devuelva PostgREST para el recurso embebido.
                const msgs: any[] = row.chats?.messages || [];
                msgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                return row;
            });

            normalized.sort((a: any, b: any) => lastMessageTime(b) - lastMessageTime(a));
            setChats(normalized);
        } catch (e) {
            console.error(e);
        } finally {
            if (!cancelledRef.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchChats(false);
    };

    useEffect(() => {
        cancelledRef.current = false;
        fetchChats();

        // RLS limita el realtime a mis chats; el debounce evita un refetch por
        // cada mensaje individual cuando llegan varios seguidos.
        const debouncedRefetch = debounce(() => fetchChats(false), 700);

        const channel = supabase
            .channel(`list_updates_${Date.now()}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'messages' },
                () => debouncedRefetch()
            )
            .subscribe();

        return () => {
            cancelledRef.current = true;
            debouncedRefetch.cancel();
            supabase.removeChannel(channel);
        };
    }, []);

    return { chats, loading, refreshing, myId, onRefresh };
}
