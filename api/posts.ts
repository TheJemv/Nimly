import { supabase } from "@/lib/supabase";
import { decode } from 'base64-arraybuffer';
// Importamos desde el path legacy para que funcione la lectura en base64
import * as FileSystem from 'expo-file-system/legacy';

export type PostType = "TEXT" | "IMAGE" | "VIDEO";

/**
 * Sube archivos al bucket 'media' usando la API legacy para asegurar el peso real.
 */
export const uploadPostMedia = async (uri: string, type: "image" | "video") => {
    try {
        const ext = uri.split('.').pop()?.toLowerCase() || (type === 'video' ? 'mp4' : 'jpg');
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        const mimeType = type === 'video' ? 'video/mp4' : `image/${ext === 'png' ? 'png' : 'jpeg'}`;

        // 1. Leemos el archivo usando la API legacy que soporta base64 directamente
        const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: 'base64',
        });

        // 2. Convertimos a ArrayBuffer
        const arrayBuffer = decode(base64);

        // 3. Subida a Supabase
        const { data, error } = await supabase.storage
            .from('media')
            .upload(fileName, arrayBuffer, {
                contentType: mimeType,
                upsert: false
            });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(fileName);
        return publicUrl;
    } catch (error) {
        console.error("Error en uploadPostMedia:", error);
        return null;
    }
};

/**
 * Crea un post nuevo
 */
export const createPost = async (
    userId: string,
    text: string,
    media?: { uri: string; type: 'image' | 'video' }
) => {
    let contentStr = text;
    let postType = 'TEXT';

    if (media) {
        postType = media.type === 'video' ? 'VIDEO' : 'IMAGE';

        try {
            // 1. Convertir archivo para subirlo
            const base64 = await FileSystem.readAsStringAsync(media.uri, {
                encoding: FileSystem.EncodingType.Base64,
            });

            const ext = media.uri.split('.').pop() || 'jpg';
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
            const filePath = `${userId}/${fileName}`; // Carpeta por usuario para más orden

            // 2. Subimos el archivo al bucket (Asegúrate de que se llame 'media' o el que uses)
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('media') // <-- Tu bucket (recuerda que en Supabase le quitaste lo de public)
                .upload(filePath, decode(base64), {
                    contentType: media.type === 'video' ? `video/${ext}` : `image/${ext}`,
                    upsert: false
                });

            if (uploadError) throw uploadError;

            // 3. LA CLAVE DE LA SEGURIDAD:
            // GUARDAMOS SOLO LA RUTA DEL ARCHIVO EN LA BASE DE DATOS, NO LA URL PÚBLICA
            // Tu PostComponent se encargará de construir la ruta "/authenticated/" al mostrarlo
            contentStr = uploadData.path;

        } catch (error) {
            console.error("Error subiendo media:", error);
            throw new Error("No se pudo subir la imagen/video");
        }
    }

    // 4. Guardamos el Post en la base de datos
    const { data, error } = await supabase
        .from('posts')
        .insert({
            user_id: userId,
            content: contentStr,
            type: postType
        })
        .select()
        .single();

    if (error) throw error;
    return data;
};

/**
 * Obtiene los posts de AMIGOS (Lógica Bidireccional)
 */
export const getFriendsPosts = async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        // 1. Buscamos quiénes son mis amigos
        const { data: friendships, error: fError } = await supabase
            .from('friends')
            .select('user_id, friend_id')
            .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

        if (fError) throw fError;

        // 2. Extraemos los IDs y nos incluimos a nosotros mismos
        const friendIds = friendships?.map(f => f.user_id === user.id ? f.friend_id : f.user_id) || [];
        const allIds = [...new Set([...friendIds, user.id])];

        // 3. CONSULTA MAESTRA: Usamos la vista 'posts_with_stats'
        // Como la vista ya tiene el JOIN con profiles y los conteos, 
        // solo necesitamos un select('*') y filtrar por los IDs de amigos.
        const { data, error } = await supabase
            .from('posts_with_stats')
            .select('*')
            .in('user_id', allIds)
            .order('created_at', { ascending: false })
            .limit(15);

        if (error) throw error;
        return data;
    } catch (error) {
        console.error("Error en getFriendsPosts:", error);
        return [];
    }
};

export const deletePost = async (postId: string, mediaUrl?: string | null) => {
    try {
        // 1. Eliminar de la tabla posts
        const { error: postError } = await supabase.from('posts').delete().eq('id', postId);
        if (postError) throw postError;

        // 2. Si tenía imagen/video, eliminar del Storage
        if (mediaUrl && mediaUrl.includes('storage/v1/object/public/media/')) {
            const fileName = mediaUrl.split('/').pop();
            if (fileName) {
                await supabase.storage.from('media').remove([fileName]);
            }
        }
        return { success: true };
    } catch (error) {
        console.error("Error al eliminar post:", error);
        throw error;
    }
};

export const toggleLike = async (postId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Buscamos si existe
    const { data: existing } = await supabase
        .from('likes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', user.id)
        .maybeSingle();

    if (!existing) {
        await supabase.from('likes').insert({
            post_id: postId,
            user_id: user.id
        });
    } else {
        //  await supabase.from('likes').delete().eq('id', existing.id);
    }
};