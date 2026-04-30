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
    reason: ReportReason;
    details?: string;
}

export const reportsApi = {
    /**
     * Envía un reporte a la bóveda de moderación.
     * Solo puede llevar targetUserId O targetPostId, no ambos.
     */
    async submitReport({ targetUserId, targetPostId, reason, details }: ReportParams) {
        try {
            // 1. Obtenemos el ID del reportero (el usuario actual)
            const { data: { user }, error: authError } = await supabase.auth.getUser();

            if (authError || !user) {
                throw new Error("No authenticated session found.");
            }

            // 2. Insertamos en la tabla reports
            const { error } = await supabase
                .from('reports')
                .insert({
                    reporter_id: user.id,
                    target_user_id: targetUserId || null,
                    target_post_id: targetPostId || null,
                    reason,
                    details: details || null,
                });

            if (error) {
                // Código 23505: Error de violación de unicidad (ya reportado)
                if (error.code === '23505') {
                    throw new Error("AlreadyReported");
                }
                throw error;
            }

            return { success: true };
        } catch (error: any) {
            console.error("Error at submitReport:", error.message);
            throw error;
        }
    }
};