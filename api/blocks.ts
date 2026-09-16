import type { ReportReason } from '@/api/reports';
import { supabase } from '@/lib/supabase';
import { assertUuid } from '@/utils/validation';

export const blocksApi = {
    /**
     * Blocks a user. Inserts into blocked_users.
     * Throws an "AlreadyBlocked" error if the block already exists.
     *
     * Also files a moderation report so the developer is notified of the
     * inappropriate content/behavior (App Store Guideline 1.2 requirement).
     * A failure to file the report does NOT prevent the block.
     */
    async blockUser(blockedId: string, reason: ReportReason = 'other', details?: string) {
        assertUuid(blockedId, 'blockedId');
        const { data: userData } = await supabase.auth.getUser();
        const blockerId = userData.user?.id;
        if (!blockerId) throw new Error('NotAuthenticated');
        if (blockerId === blockedId) throw new Error("You can't block yourself.");

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

        // Notify the developer (moderation). Best-effort: if a report from this
        // user toward that target already exists, the uniqueness constraint
        // rejects it and we ignore that.
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
                console.warn('Could not file the block report:', reportError.message);
            }
        } catch (e) {
            if (__DEV__) console.warn('Could not file the block report:', e);
        }

        return { success: true };
    },

    /**
     * Removes the block.
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
     * Checks whether the current user blocked `targetId`, or was blocked by them.
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
     * Returns the list of user IDs blocked by the current user.
     * Useful for filtering the feed instantly.
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