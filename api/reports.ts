import { supabase } from '@/lib/supabase';

// Definimos el tipo basado en tu ENUM de SQL para tener autocompletado
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
     * Envía un reporte a la bóveda de moderación.
     * Solo puede llevar UNO de: targetUserId, targetPostId, o targetStoryId.
     */
    /**
     * Inserta un reporte. Lanza `Error("AlreadyReported")` si ya existía uno igual,
     * o el error original en cualquier otro fallo. La UI decide qué mostrar.
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
            // 23505: violación de unicidad → ya lo había reportado.
            if (error.code === '23505') throw new Error("AlreadyReported");
            throw error;
        }

        return { success: true };
    }
};