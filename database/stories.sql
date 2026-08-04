-- ==========================================
-- 1. CREACIÓN DE TABLAS PRINCIPALES
-- ==========================================

-- Tabla de Historias
CREATE TABLE IF NOT EXISTS public.stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  media_url TEXT NOT NULL,
  media_type TEXT CHECK (media_type IN ('image', 'video')) NOT NULL,
  is_view_once BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Tabla de Vistas de Historias
CREATE TABLE IF NOT EXISTS public.story_views (
  story_id UUID REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (story_id, viewer_id)
);

-- Tabla de Likes / Reacciones
CREATE TABLE IF NOT EXISTS public.story_likes (
  story_id UUID REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction TEXT DEFAULT '❤️',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (story_id, user_id)
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;


-- ==========================================
-- 2. FUNCIÓN HELPER: VERIFICACIÓN DE AMISTAD
-- ==========================================

CREATE OR REPLACE FUNCTION public.are_friends(user_a UUID, user_b UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND ((user_id = user_a AND friend_id = user_b)
        OR (user_id = user_b AND friend_id = user_a))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==========================================
-- 3. POLÍTICAS RLS: TABLA `stories`
-- ==========================================

-- LECTURA: El dueño ve TODO su archivo; los amigos solo ven las de últimas 24h
CREATE POLICY "Ver historias activas o archivo propio"
ON public.stories
FOR SELECT
USING (
  auth.uid() = user_id 
  OR (
    public.are_friends(auth.uid(), user_id) 
    AND created_at >= (NOW() - INTERVAL '24 hours')
  )
);

-- CREACIÓN: Solo puedes publicar a tu propio nombre
CREATE POLICY "Crear historias propias"
ON public.stories
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- ELIMINACIÓN: Solo el dueño puede borrar manualmente una historia
CREATE POLICY "Eliminar historias propias"
ON public.stories
FOR DELETE
USING (auth.uid() = user_id);


-- ==========================================
-- 4. POLÍTICAS RLS: TABLA `story_views`
-- ==========================================

-- REGISTRAR VISTA: Solo si eres amigo y la historia tiene menos de 24 horas
CREATE POLICY "Registrar vista en historias activas"
ON public.story_views
FOR INSERT
WITH CHECK (
  auth.uid() = viewer_id
  AND EXISTS (
    SELECT 1 FROM public.stories s
    WHERE s.id = story_id
      AND public.are_friends(auth.uid(), s.user_id)
      AND s.created_at >= (NOW() - INTERVAL '24 hours')
  )
);

-- VER VISTAS: El dueño ve las vistas de todo su historial; el espectador ve sus propias vistas
CREATE POLICY "Consultar vistas de historias"
ON public.story_views
FOR SELECT
USING (
  auth.uid() = viewer_id
  OR EXISTS (
    SELECT 1 FROM public.stories s
    WHERE s.id = story_id AND s.user_id = auth.uid()
  )
);


-- ==========================================
-- 5. POLÍTICAS RLS: TABLA `story_likes`
-- ==========================================

-- DAR LIKE / REACCIONAR: Solo a historias activas de amigos
CREATE POLICY "Dar like a historias activas"
ON public.story_likes
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.stories s
    WHERE s.id = story_id
      AND public.are_friends(auth.uid(), s.user_id)
      AND s.created_at >= (NOW() - INTERVAL '24 hours')
  )
);

-- QUITAR LIKE: Solo el usuario que dio el like puede quitarlo
CREATE POLICY "Quitar like propio"
ON public.story_likes
FOR DELETE
USING (auth.uid() = user_id);

-- CONSULTAR LIKES: El dueño siempre ve los likes recibidos en sus historias (incluso archivadas)
CREATE POLICY "Consultar likes de historias"
ON public.story_likes
FOR SELECT
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.stories s
    WHERE s.id = story_id AND s.user_id = auth.uid()
  )
);


-- ==========================================
-- 6. POLÍTICAS DE ACCESO PARA STORAGE (`stories` bucket)
-- ==========================================

-- Recuerda crear un Bucket llamado 'stories' (privado) en la pestaña Storage de Supabase.

CREATE POLICY "Acceso a archivos de historias"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'stories' 
  AND (
    -- El dueño del archivo siempre puede descargarlo/verlo
    (storage.foldername(name))[1] = auth.uid()::text
    -- Sus amigos pueden ver el archivo si la historia asociada sigue activa
    OR EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.media_url LIKE '%' || name
        AND public.are_friends(auth.uid(), s.user_id)
        AND s.created_at >= (NOW() - INTERVAL '24 hours')
    )
  )
);

CREATE POLICY "Subir archivos de historias propios"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'stories' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);