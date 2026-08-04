import { supabase } from '@/lib/supabase';

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
  /**
   * 1. Sube el archivo multimedia al Storage privado y crea el registro en PostgreSQL.
   */
  async createStory(localUri: string, mediaType: 'image' | 'video', isViewOnce: boolean = false) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No authenticated session found");

    const fileExt = mediaType === 'video' ? 'mp4' : 'jpg';
    const filePath = `${user.id}/${Date.now()}.${fileExt}`;
    const mimeType = mediaType === 'video' ? 'video/mp4' : 'image/jpeg';

    // A. Convertir la URI local de React Native a ArrayBuffer (evita que el archivo quede corrupto/negro)
    const response = await fetch(localUri);
    const arrayBuffer = await response.arrayBuffer();

    // B. Subir el archivo al bucket privado 'stories'
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('stories')
      .upload(filePath, arrayBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    // C. Insertar registro en la tabla stories
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

  /**
   * 2. Obtiene el feed de historias e incluye URLs Firmadas para el visor.
   */
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

    // Firmar URLs
    const storiesWithSignedUrls = await Promise.all(
      (data as any[]).map(async (story) => {
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

    return storiesWithSignedUrls;
  },

  /**
   * 3. Registra vista de una historia.
   */
  async markAsViewed(storyId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { error } = await supabase
      .from('story_views')
      .insert([{ story_id: storyId, viewer_id: user.id }], { upsert: true });

    if (error) throw error;
    return true;
  },

  /**
   * 4. Alterna Like/Reacción.
   */
    async toggleLike(storyId: string, reaction: string = '❤️') {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // 1. Consultar si ya existe el like
        const { data: existingLike } = await supabase
            .from('story_likes')
            .select('id')
            .eq('story_id', storyId)
            .eq('user_id', user.id)
            .maybeSingle();

        if (existingLike) {
            // 2. Si ya existe, lo eliminamos (Quitar me gusta)
            const { error } = await supabase
            .from('story_likes')
            .delete()
            .eq('story_id', storyId)
            .eq('user_id', user.id);

            if (error) throw error;
            return { action: 'unliked' };
        } else {
            // 3. Si no existe, usamos UPSERT con ignoreDuplicates para prevenir el error 23505
            const { error } = await supabase
            .from('story_likes')
            .upsert(
                {
                story_id: storyId,
                user_id: user.id,
                reaction: reaction,
                },
                { onConflict: 'story_id, user_id', ignoreDuplicates: true }
            );

            if (error) throw error;
            return { action: 'liked' };
        }
    },

  /**
   * 5. Obtiene el Archivo Personal.
   */
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

    // Firmar URLs para el archivo
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

  // Insertar la vista ignorando si ya la había visto previamente
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
    .eq('user_id', user.id); // Seguridad para asegurar que es tuya

  if (error) throw error;
  return true;
},
};