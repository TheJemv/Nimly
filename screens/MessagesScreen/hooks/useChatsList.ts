import { useAppForeground } from '@/hooks/useAppForeground';
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
    // Incremented when returning from the background to recreate the realtime channel.
    const [resyncNonce, setResyncNonce] = useState(0);

    const fetchChats = async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || cancelledRef.current) return;
            setMyId(user.id);

            const [chatsRes, unreadRes] = await Promise.all([
                supabase
                    .from('chat_participants')
                    .select(`
                        chat_id,
                        chats (
                            id,
                            created_at,
                            messages (content, created_at, sender_id, type, is_read, reply_to_story_id)
                        ),
                        profiles:user_id (id, username, avatar_config, avatar_url, public_key)
                    `)
                    .neq('user_id', user.id)
                    // Only each chat's LAST message — all the row shows. Embedding
                    // them all re-downloaded every chat's entire history on every
                    // new message (this refetches on each realtime event).
                    .order('created_at', { referencedTable: 'chats.messages', ascending: false })
                    .limit(1, { referencedTable: 'chats.messages' }),
                // Unread counts from just the unread rows (RLS scopes them to my chats).
                supabase
                    .from('messages')
                    .select('chat_id')
                    .eq('is_read', false)
                    .neq('sender_id', user.id),
            ]);

            if (chatsRes.error) throw chatsRes.error;
            if (unreadRes.error) throw unreadRes.error;
            if (cancelledRef.current) return;

            const unreadByChat = new Map<string, number>();
            for (const row of unreadRes.data || []) {
                unreadByChat.set(row.chat_id, (unreadByChat.get(row.chat_id) ?? 0) + 1);
            }

            const normalized = (chatsRes.data || []).map((row: any) => ({
                ...row,
                unreadCount: unreadByChat.get(row.chat_id) ?? 0,
            }));

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
        if (resyncNonce === 0) fetchChats();
        else fetchChats(false); // when reconnecting, don't show the loading spinner

        // RLS limits realtime to my chats; the debounce avoids a refetch for
        // every individual message when several arrive in a row.
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
    }, [resyncNonce]);

    // When returning to the foreground: recreate the channel + refetch (the WS may have died).
    useAppForeground(() => setResyncNonce((n) => n + 1));

    return { chats, loading, refreshing, myId, onRefresh };
}
