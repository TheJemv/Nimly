// api/friends.ts
import { supabase } from '@/lib/supabase';
import { assertUuid } from '@/utils/validation';

export const friendsApi = {
    /**
     * Sends a connection request.
     */
    async sendRequest(targetId: string) {
        assertUuid(targetId, 'targetId');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("No authenticated session found");

        const { data, error } = await supabase
            .from('friend_requests')
            .insert([{ from_id: user.id, to_id: targetId, status: 'PENDING' }])
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Checks the relationship status bidirectionally.
     */
    async getStatus(targetId: string) {
        const safeTarget = assertUuid(targetId, 'targetId');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        // 1. First check whether they're already friends in the 'friends' table
        const { data: friendship } = await supabase
            .from('friends')
            .select('*')
            .or(`and(user_id.eq.${user.id},friend_id.eq.${safeTarget}),and(user_id.eq.${safeTarget},friend_id.eq.${user.id})`)
            .maybeSingle();

        if (friendship) return { status: 'ACCEPTED' };

        // 2. If they're not friends, check whether there's a PENDING request in either direction
        const { data: request } = await supabase
            .from('friend_requests')
            .select('id, status, from_id, to_id')
            .or(`and(from_id.eq.${user.id},to_id.eq.${safeTarget}),and(from_id.eq.${safeTarget},to_id.eq.${user.id})`)
            .eq('status', 'PENDING')
            .maybeSingle();

        if (request) {
            return {
                status: 'PENDING',
                from_id: request.from_id,
                to_id: request.to_id,
                isReceiver: request.to_id === user.id, // Am I the one who needs to accept?
                requestId: request.id
            };
        }

        return { status: 'NONE' };
    },

    async acceptFriendship(notification: any) {
        // 1. Update the request status
        const { error: requestError } = await supabase
            .from('friend_requests')
            .update({ status: 'ACCEPTED' })
            .eq('id', notification.request_id || notification.id);

        if (requestError) throw requestError;

        // 2. Insert into the friends table
        const { error: friendError } = await supabase
            .from('friends')
            .insert([{
                user_id: notification.user_id || notification.to_id,
                friend_id: notification.actor_id || notification.from_id
            }]);

        if (friendError) throw friendError;

        // 3. Optional: update the notification if it exists
        if (notification.id) {
            await supabase
                .from('notifications')
                .update({ content: 'is now your friend.', is_read: true })
                .eq('id', notification.id);
        }

        return true;
    },

    async getFriendsCount(targetUserId?: string) {
        const { data: { user } } = await supabase.auth.getUser();
        const idToQuery = targetUserId || user?.id;
        if (!idToQuery) return 0;
        const safeId = assertUuid(idToQuery, 'userId');

        const { count, error } = await supabase
            .from('friends')
            .select('*', { count: 'exact', head: true })
            .or(`user_id.eq.${safeId},friend_id.eq.${safeId}`);

        if (error) throw error;
        return count || 0;
    },

    async severConnection(friendId: string) {
        assertUuid(friendId, 'friendId');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Unauthorized");
        const { error } = await supabase.rpc('sever_connection_and_wipe_chat', {
            user_a: user.id,
            user_b: friendId
        });

        if (error) {
            console.error("Error in Deep Sever:", error);
            throw error;
        }

        return true;
    },

    async getFriendsList(page: number = 0, pageSize: number = 20) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
            .from('friends')
            .select(`
                user_id,
                friend_id,
                profiles_user:user_id (id, username, avatar_url, avatar_config),
                profiles_friend:friend_id (id, username, avatar_url, avatar_config)
            `)
            .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw error;
        return data.map(f => f.user_id === user.id ? f.profiles_friend : f.profiles_user);
    }
};