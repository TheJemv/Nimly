import { supabase } from '@/lib/supabase';
import { IMAGE_QUALITY, optimizeImageForUpload } from '@/utils/compressImage';
import { VIDEO_QUALITY, compressVideoForUpload } from '@/utils/compressVideo';
import { User } from '@supabase/supabase-js';

export interface Story {
  id: string;
  user_id: string;
  media_url: string;
  /** Path desnudo dentro del bucket 'stories' ("userId/123.jpg"). Se preserva
   *  para poder resolver el media vía el caché en disco (mediaCache) por path,
   *  no por URL firmada — el token rota y rompería el caché. */
  media_path?: string;
  media_type: 'image' | 'video';
  is_view_once: boolean;
  created_at: string;
  // Streaming HLS: mismo pipeline que los posts. 'ready' -> sirve HLS.
  playback_status?: 'raw' | 'ready' | 'error';
  hls_path?: string | null;
  profiles?: {
    id: string;
    username: string;
    avatar_url: string | null;
    avatar_config: any;
  };
  story_views?: { viewer_id: string }[];
  story_likes?: { user_id: string; reaction: string }[];
}

export const storiesApi = {
  async createStory(localUri: string, mediaType: 'image' | 'video', isViewOnce: boolean = false) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No authenticated session found");

    let fileUri = localUri;
    if (mediaType === 'image') {
      fileUri = await optimizeImageForUpload(localUri, IMAGE_QUALITY.story);
    } else {
      // Video -> 1080p / 5.5 Mbps. Nunca falla: usa el original si no puede.
      fileUri = await compressVideoForUpload(localUri, VIDEO_QUALITY.feed);
    }

    const fileExt = mediaType === 'video' ? 'mp4' : 'jpg';
    const filePath = `${user.id}/${Date.now()}.${fileExt}`;
    const mimeType = mediaType === 'video' ? 'video/mp4' : 'image/jpeg';

    const response = await fetch(fileUri);
    const arrayBuffer = await response.arrayBuffer();

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('stories')
      .upload(filePath, arrayBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: storyData, error: storyError } = await supabase
      .from('stories')
      .insert([{
        user_id: user.id,
        media_url: uploadData.path,
        media_type: mediaType,
        is_view_once: isViewOnce
      }])
      .select()
      .single();

    if (storyError) throw storyError;
    return storyData;
  },

  async getActiveFeed(user: User) {
      if (!user) return [];

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('stories')
        .select(`
          *,
          profiles:user_id (id, username, avatar_config),
          story_views (
            viewer_id,
            viewed_at,
            profiles:viewer_id (id, username, avatar_config)
          ),
          story_likes (user_id, reaction)
        `)
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const stories = data as any[];
      if (stories.length === 0) return [];

      // Ya NO firmamos aquí: el media se resuelve en el viewer vía el caché en
      // disco (mediaCache) por el path desnudo. Firmar en cada `reloadStories`
      // (y realtime dispara muchos) gastaba ancho de banda y rompía el caché.
      // `media_url` se mantiene como el path desnudo; `media_path` lo hace
      // explícito para el código nuevo.
      return stories.map((story) => {
          const likesList = story.story_likes || [];
          const isLikedByMe = likesList.some((l: any) => l.user_id === user.id);
          return {
              ...story,
              media_path: story.media_url,
              is_liked_by_me: isLikedByMe,
          };
      });
  },

  // 💖 TOGGLE LIKE CORREGIDO Y BLINDADO
  async toggleLike(storyId: string, reaction: string = '❤️') {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // 1. Validar si ya existe el like usando las columnas reales de la tabla
    const { data: existingLike, error: fetchError } = await supabase
        .from('story_likes')
        .select('story_id, user_id')
        .eq('story_id', storyId)
        .eq('user_id', user.id)
        .maybeSingle();

    if (fetchError) {
        console.error("Error buscando like previo:", fetchError);
        throw fetchError;
    }

    if (existingLike) {
        // 2. Si ya existe, lo borramos (Unlike)
        const { error: deleteError } = await supabase
            .from('story_likes')
            .delete()
            .eq('story_id', storyId)
            .eq('user_id', user.id);

        if (deleteError) {
            console.error("Error al quitar like:", deleteError);
            throw deleteError;
        }
        return { action: 'unliked' };
    } else {
        // 3. Si no existe, lo insertamos (Like)
        const { error: insertError } = await supabase
            .from('story_likes')
            .insert({
                story_id: storyId,
                user_id: user.id,
                reaction: reaction,
            });

        if (insertError) {
            // 🛡️ Si otra llamada concurrente ya insertó el mismo like (condición de carrera),
            // no es un error real: el resultado final deseado (like existente) ya se cumplió.
            if (insertError.code === '23505') {
                return { action: 'liked' };
            }
            console.error("Error al insertar like:", insertError);
            throw insertError;
        }
        return { action: 'liked' };
    }
  },

  async getMyArchive() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data, error } = await supabase
      .from('stories')
      .select(`
        *,
        story_views (viewer_id, viewed_at, profiles:viewer_id(username, avatar_url)),
        story_likes (user_id, reaction, profiles:user_id(username))
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Igual que `getActiveFeed`: no firmamos, preservamos el path desnudo y el
    // viewer resuelve vía el caché en disco.
    return (data || []).map((story) => ({
      ...story,
      media_path: story.media_url,
    }));
  },

  async markAsSeen(storyId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('story_views')
      .upsert(
        {
          story_id: storyId,
          viewer_id: user.id,
        },
        { onConflict: 'story_id, viewer_id', ignoreDuplicates: true }
      );

    if (error) {
      console.warn("Error registrando vista de historia:", error);
    }
  },

  async deleteStory(storyId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('stories')
      .delete()
      .eq('id', storyId)
      .eq('user_id', user.id);

    if (error) throw error;
    return true;
  },
};