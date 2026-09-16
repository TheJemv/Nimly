import { supabase } from '@/lib/supabase';

// Define the type based on your SQL ENUM to get autocomplete
export type ReportReason =
    | 'spam'
    | 'harassment'
    | 'inappropriate_content'
    | 'scam'
    | 'other';

interface ReportParams {
    targetUserId?: string;
    targetPostId?: string;
    targetStoryId?: string;
    reason: ReportReason;
    details?: string;
}

export const reportsApi = {
    /**
     * Sends a report to the moderation vault.
     * Can only carry ONE of: targetUserId, targetPostId, or targetStoryId.
     */
    /**
     * Inserts a report. Throws `Error("AlreadyReported")` if an identical one
     * already existed, or the original error on any other failure. The UI
     * decides what to display.
     */
    async submitReport({ targetUserId, targetPostId, targetStoryId, reason, details }: ReportParams) {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            throw new Error("No authenticated session found.");
        }

        const { error } = await supabase
            .from('reports')
            .insert({
                reporter_id: user.id,
                target_user_id: targetUserId || null,
                target_post_id: targetPostId || null,
                target_story_id: targetStoryId || null,
                reason,
                details: details || null,
            });

        if (error) {
            // 23505: uniqueness violation → had already reported this.
            if (error.code === '23505') throw new Error("AlreadyReported");
            throw error;
        }

        return { success: true };
    }
};