import { supabase } from '@/lib/supabase';

export const blocksApi = {
    /**
     * Bloquea a un usuario. Inserta en blocked_users.
     * Lanza error "AlreadyBlocked" si ya existe el bloqueo.
     */
    async blockUser(blockedId: string) {
        const { data: userData } = await supabase.auth.getUser();
        const blockerId = userData.user?.id;
        if (!blockerId) throw new Error('NotAuthenticated');

        // Check if already blocked
        const { data: existing } = await supabase
            .from('blocked_users')
            .select('id')
            .eq('blocker_id', blockerId)
            .eq('blocked_id', blockedId)
            .maybeSingle();

        if (existing) {
            throw new Error('AlreadyBlocked');
        }

        const { error } = await supabase
            .from('blocked_users')
            .insert({ blocker_id: blockerId, blocked_id: blockedId });

        if (error) throw error;

        // Sever any existing friendship/connection in both directions
        await supabase
            .from('friends')
            .delete()
            .or(`and(user_id.eq.${blockerId},friend_id.eq.${blockedId}),and(user_id.eq.${blockedId},friend_id.eq.${blockerId})`);

        // Remove any pending friend requests in both directions
        await supabase
            .from('friend_requests')
            .delete()
            .or(`and(from_id.eq.${blockerId},to_id.eq.${blockedId}),and(from_id.eq.${blockedId},to_id.eq.${blockerId})`);

        return { success: true };
    },

    /**
     * Quita el bloqueo.
     */
    async unblockUser(blockedId: string) {
        const { data: userData } = await supabase.auth.getUser();
        const blockerId = userData.user?.id;
        if (!blockerId) throw new Error('NotAuthenticated');

        const { error } = await supabase
            .from('blocked_users')
            .delete()
            .eq('blocker_id', blockerId)
            .eq('blocked_id', blockedId);

        if (error) throw error;
        return { success: true };
    },

    /**
     * Revisa si el usuario actual bloqueó a `targetId`, o si fue bloqueado por él.
     */
    async getBlockStatus(targetId: string) {
        const { data: userData } = await supabase.auth.getUser();
        const myId = userData.user?.id;
        if (!myId) throw new Error('NotAuthenticated');

        const { data, error } = await supabase
            .from('blocked_users')
            .select('blocker_id, blocked_id')
            .or(`and(blocker_id.eq.${myId},blocked_id.eq.${targetId}),and(blocker_id.eq.${targetId},blocked_id.eq.${myId})`);

        if (error) throw error;

        const iBlockedThem = (data ?? []).some(b => b.blocker_id === myId && b.blocked_id === targetId);
        const theyBlockedMe = (data ?? []).some(b => b.blocker_id === targetId && b.blocked_id === myId);

        return { iBlockedThem, theyBlockedMe };
    },

    /**
     * Devuelve la lista de IDs de usuarios bloqueados por el usuario actual.
     * Útil para filtrar el feed instantáneamente.
     */
    async getBlockedIds(): Promise<string[]> {
        const { data: userData } = await supabase.auth.getUser();
        const myId = userData.user?.id;
        if (!myId) return [];

        const { data, error } = await supabase
            .from('blocked_users')
            .select('blocked_id')
            .eq('blocker_id', myId);

        if (error) throw error;
        return (data ?? []).map(b => b.blocked_id);
    },
};