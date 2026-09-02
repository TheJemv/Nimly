import type { ReportReason } from '@/api/reports';
import { supabase } from '@/lib/supabase';
import { assertUuid } from '@/utils/validation';

export const blocksApi = {
    /**
     * Bloquea a un usuario. Inserta en blocked_users.
     * Lanza error "AlreadyBlocked" si ya existe el bloqueo.
     *
     * Además registra un reporte de moderación para que el desarrollador quede
     * notificado del contenido/comportamiento inapropiado (requisito de la
     * App Store Guideline 1.2). El fallo al registrar el reporte NO impide el
     * bloqueo.
     */
    async blockUser(blockedId: string, reason: ReportReason = 'other', details?: string) {
        assertUuid(blockedId, 'blockedId');
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

        // Notificar al desarrollador (moderación). Best-effort: si ya existe un
        // reporte de este usuario hacia ese target, la unicidad lo rechaza y lo
        // ignoramos.
        try {
            const { error: reportError } = await supabase
                .from('reports')
                .insert({
                    reporter_id: blockerId,
                    target_user_id: blockedId,
                    reason,
                    details: details ?? 'Filed automatically when the user blocked this account.',
                });
            if (reportError && reportError.code !== '23505' && __DEV__) {
                console.warn('No se pudo registrar el reporte de bloqueo:', reportError.message);
            }
        } catch (e) {
            if (__DEV__) console.warn('No se pudo registrar el reporte de bloqueo:', e);
        }

        return { success: true };
    },

    /**
     * Quita el bloqueo.
     */
    async unblockUser(blockedId: string) {
        assertUuid(blockedId, 'blockedId');
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
        const safeTarget = assertUuid(targetId, 'targetId');
        const { data: userData } = await supabase.auth.getUser();
        const myId = userData.user?.id;
        if (!myId) throw new Error('NotAuthenticated');

        const { data, error } = await supabase
            .from('blocked_users')
            .select('blocker_id, blocked_id')
            .or(`and(blocker_id.eq.${myId},blocked_id.eq.${safeTarget}),and(blocker_id.eq.${safeTarget},blocked_id.eq.${myId})`);

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