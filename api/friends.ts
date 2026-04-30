// api/friends.ts
import { supabase } from '@/lib/supabase';

export const friendsApi = {
    /**
     * Envía una solicitud de conexión.
     */
    async sendRequest(targetId: string) {
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
     * Verifica el estado de la relación de forma bidireccional.
     */
    async getStatus(targetId: string) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        // 1. Primero checamos si ya son amigos en la tabla 'friends'
        const { data: friendship } = await supabase
            .from('friends')
            .select('*')
            .or(`and(user_id.eq.${user.id},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${user.id})`)
            .maybeSingle();

        if (friendship) return { status: 'ACCEPTED' };

        // 2. Si no son amigos, checamos si hay solicitud PENDING en cualquier dirección
        const { data: request } = await supabase
            .from('friend_requests')
            .select('id, status, from_id, to_id')
            .or(`and(from_id.eq.${user.id},to_id.eq.${targetId}),and(from_id.eq.${targetId},to_id.eq.${user.id})`)
            .eq('status', 'PENDING')
            .maybeSingle();

        if (request) {
            return {
                status: 'PENDING',
                from_id: request.from_id,
                to_id: request.to_id,
                isReceiver: request.to_id === user.id, // ¿Yo soy el que debe aceptar?
                requestId: request.id
            };
        }

        return { status: 'NONE' };
    },

    async acceptFriendship(notification: any) {
        // 1. Actualizar estado de la solicitud
        const { error: requestError } = await supabase
            .from('friend_requests')
            .update({ status: 'ACCEPTED' })
            .eq('id', notification.request_id || notification.id);

        if (requestError) throw requestError;

        // 2. Insertar en la tabla friends
        const { error: friendError } = await supabase
            .from('friends')
            .insert([{
                user_id: notification.user_id || notification.to_id,
                friend_id: notification.actor_id || notification.from_id
            }]);

        if (friendError) throw friendError;

        // 3. Opcional: Actualizar notificación si existe
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

        const { count, error } = await supabase
            .from('friends')
            .select('*', { count: 'exact', head: true })
            .or(`user_id.eq.${idToQuery},friend_id.eq.${idToQuery}`);

        if (error) throw error;
        return count || 0;
    },

    async severConnection(friendId: string) {
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