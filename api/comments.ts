import { supabase } from "@/lib/supabase";

const COMMENTS_PER_PAGE = 15;

export const getComments = async (postId: string, page: number = 0) => {
    const from = page * COMMENTS_PER_PAGE;
    const to = from + COMMENTS_PER_PAGE - 1;

    const { data, error } = await supabase
        .from('comments')
        .select(`
            id, content, created_at, user_id,
            user:profiles (username, avatar_config)
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: false }) // Los más recientes arriba
        .range(from, to);

    if (error) throw error;
    return data;
};

export const createComment = async (postId: string, content: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Debes iniciar sesión para comentar");

    const { data, error } = await supabase
        .from('comments')
        .insert({
            post_id: postId,
            user_id: user.id,
            content
        })
        .select(`
            id, content, created_at, user_id,
            user:profiles (username, avatar_config)
        `)
        .single(); // Devolvemos el comentario recién creado para agregarlo a la lista

    if (error) throw error;
    return data;
};

export const deleteComment = async (commentId: string) => {
    const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);

    if (error) throw error;
    return true;
};