import { supabase } from "@/lib/supabase";
import { IMAGE_QUALITY, optimizeImageForUpload } from "@/utils/compressImage";
import { VIDEO_QUALITY, compressVideoForUpload } from "@/utils/compressVideo";
import { decode } from 'base64-arraybuffer';
// Import from the legacy path so base64 reading works
import * as FileSystem from 'expo-file-system/legacy';

export type PostType = "TEXT" | "IMAGE" | "VIDEO";

/**
 * Uploads files to the 'media' bucket using the legacy API to ensure the actual file size.
 */
export const uploadPostMedia = async (uri: string, type: "image" | "video") => {
    try {
        const ext = uri.split('.').pop()?.toLowerCase() || (type === 'video' ? 'mp4' : 'jpg');
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        const mimeType = type === 'video' ? 'video/mp4' : `image/${ext === 'png' ? 'png' : 'jpeg'}`;

        // 1. Read the file using the legacy API, which supports base64 directly
        const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: 'base64',
        });

        // 2. Convert to ArrayBuffer
        const arrayBuffer = decode(base64);

        // 3. Upload to Supabase
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
        console.error("Error in uploadPostMedia:", error);
        return null;
    }
};

/**
 * Creates a new post allowing text, media (image/video), or both combined.
 */
export const createPost = async (
    userId: string,
    text: string,
    media?: { uri: string; type: 'image' | 'video' }
) => {
    let mediaPath = null;
    if (!media && !text) return
    if (media) {
        try {
            // Video -> 1080p / 5.5 Mbps. Image -> JPEG q0.92 up to 2400px.
            // Never fails: falls back to the original if it can't.
            const sourceUri = media.type === 'video'
                ? await compressVideoForUpload(media.uri, VIDEO_QUALITY.feed)
                : await optimizeImageForUpload(media.uri, IMAGE_QUALITY.post);

            const base64 = await FileSystem.readAsStringAsync(sourceUri, {
                encoding: FileSystem.EncodingType.Base64,
            });

            const ext = sourceUri.split('.').pop() || 'jpg';
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
            const filePath = `${userId}/${fileName}`; // Per-user folder to keep things organized

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('media')
                .upload(filePath, decode(base64), {
                    contentType: media.type === 'video' ? `video/${ext}` : `image/${ext}`,
                    upsert: false
                });

            if (uploadError) throw uploadError;
            mediaPath = uploadData.path;

        } catch (error) {
            console.error("Error uploading media:", error);
            throw new Error("Couldn't upload the image/video");
        }
    }

    const { data, error } = await supabase
        .from('posts')
        .insert({
            user_id: userId,
            content: text ? text : null,
            media_url: mediaPath ? mediaPath : null
        })
        .select()
        .single();

    if (error) {
        console.error("Supabase Insert Error:", error);
        throw error;
    }
    
    return data;
};

/**
 * Fetches FRIENDS' posts (bidirectional logic)
 */
export const getFriendsPosts = async (userId: string) => {
    try {
        if (!userId) return [];
        const { data, error } = await supabase.rpc('get_friends_posts', {
            requesting_user_id: userId,
        });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error("Error in getFriendsPosts:", error);
        return [];
    }
};

export const deletePost = async (postId: string, mediaUrl?: string | null) => {
    try {
        // 1. Delete from the posts table
        const { error: postError } = await supabase.from('posts').delete().eq('id', postId);
        if (postError) throw postError;

        // 2. If it had an image/video, delete it from Storage
        if (mediaUrl && mediaUrl.includes('storage/v1/object/public/media/')) {
            const fileName = mediaUrl.split('/').pop();
            if (fileName) {
                await supabase.storage.from('media').remove([fileName]);
            }
        }
        return { success: true };
    } catch (error) {
        console.error("Error deleting post:", error);
        throw error;
    }
};

export const toggleLike = async (postId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Check whether it already exists
    const { data: existing } = await supabase
        .from('likes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', user.id)
        .maybeSingle();

    if (!existing) {
        // If it doesn't exist, add it (Like)
        const { error } = await supabase.from('likes').insert({
            post_id: postId,
            user_id: user.id
        });
        if (error) throw error;
    } else {
        // If it already exists, remove it (Unlike) 👇
        const { error } = await supabase.from('likes').delete().eq('id', existing.id);
        if (error) throw error;
    }
};