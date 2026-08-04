import { supabase } from '@/lib/supabase';
import * as ImageManipulator from 'expo-image-manipulator';

export interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  is_view_once: boolean;
  created_at: string;
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
      try {
        const manipResult = await ImageManipulator.manipulateAsync(
          localUri,
          [{ resize: { width: 1080 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
        );
        fileUri = manipResult.uri;
      } catch (err) {
        console.warn("No se pudo comprimir la imagen, usando original:", err);
      }
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

  async getActiveFeed() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('stories')
      .select(`
        *,
        profiles:user_id (id, username, avatar_url, avatar_config),
        story_views (
          viewer_id,
          viewed_at,
          profiles:viewer_id (id, username, avatar_url, avatar_config)
        ),
        story_likes (user_id, reaction)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const storiesWithSignedUrls = await Promise.all(
      (data as any[]).map(async (story) => {
        try {
          const { data: signedData } = await supabase.storage
            .from('stories')
            .createSignedUrl(story.media_url, 3600);

          // 🔍 AQUÍ ESTÁ LA CLAVE: Verificamos si el usuario actual ya le dio like
          const likesList = story.story_likes || [];
          const isLikedByMe = likesList.some((l: any) => l.user_id === user.id);

          return {
            ...story,
            media_url: signedData?.signedUrl || story.media_url,
            is_liked_by_me: isLikedByMe, // 👈 Inyectamos el booleano exacto
          };
        } catch {
          return story;
        }
      })
    );

    return storiesWithSignedUrls;
  },

  async markAsViewed(storyId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { error } = await supabase
      .from('story_views')
      .insert([{ story_id: storyId, viewer_id: user.id }], { upsert: true });

    if (error) throw error;
    return true;
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

    const archiveWithSignedUrls = await Promise.all(
      (data || []).map(async (story) => {
        try {
          const { data: signedData } = await supabase.storage
            .from('stories')
            .createSignedUrl(story.media_url, 3600);

          return {
            ...story,
            media_url: signedData?.signedUrl || story.media_url,
          };
        } catch {
          return story;
        }
      })
    );

    return archiveWithSignedUrls;
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