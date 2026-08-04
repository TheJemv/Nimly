-- ==========================================
-- 1. LIMPIEZA ABSOLUTA (TEARDOWN COMPLETO)
-- ==========================================

-- Eliminar Triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS set_report_number ON public.reports;
DROP TRIGGER IF EXISTS tr_after_like ON public.likes;
DROP TRIGGER IF EXISTS on_comment_created ON public.comments;
DROP TRIGGER IF EXISTS tr_create_notification_on_request ON public.friend_requests;
DROP TRIGGER IF EXISTS tr_sync_accept_notif ON public.friend_requests;
DROP TRIGGER IF EXISTS send_push_on_message ON public.messages;
DROP TRIGGER IF EXISTS notify_general_events ON public.notifications;

-- Eliminar Funciones / RPCs
DROP FUNCTION IF EXISTS public.handle_new_user_profile() CASCADE;
DROP FUNCTION IF EXISTS public.generate_report_number() CASCADE;
DROP FUNCTION IF EXISTS public.on_new_like() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_comment_notification() CASCADE;
DROP FUNCTION IF EXISTS public.handler_new_friend_request() CASCADE;
DROP FUNCTION IF EXISTS public.handler_accept_friend_request_sync() CASCADE;
DROP FUNCTION IF EXISTS public.sever_connection_and_wipe_chat(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.delete_user_account() CASCADE;
DROP FUNCTION IF EXISTS public.get_my_chats() CASCADE;

-- Eliminar Vistas
DROP VIEW IF EXISTS public.posts_with_stats CASCADE;

-- Eliminar Tablas
DROP TABLE IF EXISTS public.messages_media CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.chat_participants CASCADE;
DROP TABLE IF EXISTS public.chats CASCADE;
DROP TABLE IF EXISTS public.reports CASCADE;
DROP TABLE IF EXISTS public.blocked_users CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.friends CASCADE;
DROP TABLE IF EXISTS public.friend_requests CASCADE;
DROP TABLE IF EXISTS public.comments CASCADE;
DROP TABLE IF EXISTS public.likes CASCADE;
DROP TABLE IF EXISTS public.posts CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Eliminar Tipos y Secuencias
DROP TYPE IF EXISTS message_content_type CASCADE;
DROP TYPE IF EXISTS report_reason CASCADE;
DROP SEQUENCE IF EXISTS report_number_seq CASCADE;


-- ==========================================
-- 2. EXTENSIONES, TIPOS Y SECUENCIAS
-- ==========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA extensions;

-- Tipos ENUM personalizados
CREATE TYPE message_content_type AS ENUM ('text', 'media', 'image', 'image-view-once');
CREATE TYPE report_reason AS ENUM ('spam', 'harassment', 'inappropriate_content', 'scam', 'other');

-- Secuencia para folios correlativos de reportes (RP-0001)
CREATE SEQUENCE report_number_seq START 1;


-- ==========================================
-- 3. CREACIÓN DE TABLAS BASE
-- ==========================================

-- PROFILES (Vinculada a auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  avatar_config JSONB,
  description TEXT,
  current_device_id TEXT,
  expo_push_token TEXT,
  public_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- POSTS (Publicaciones del feed)
CREATE TABLE public.posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT CHECK (type IN ('IMAGE', 'TEXT')) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- LIKES
CREATE TABLE public.likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, post_id)
);

-- COMMENTS
CREATE TABLE public.comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- FRIEND REQUESTS
CREATE TABLE public.friend_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(from_id, to_id)
);

-- FRIENDS (Relación confirmada)
CREATE TABLE public.friends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, friend_id)
);

-- CHATS & PARTICIPANTS
CREATE TABLE public.chats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE public.chat_participants (
  chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (chat_id, user_id)
);

-- MESSAGES (Mensajes cifrados y multimedia)
CREATE TABLE public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT,
  image_url TEXT,
  type message_content_type DEFAULT 'text',
  is_read BOOLEAN DEFAULT FALSE NOT NULL,
  encryption_iv TEXT,
  encryption_tag TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- MESSAGES MEDIA (Imágenes efímeras / Burn Media)
CREATE TABLE public.messages_media (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  encryption_key TEXT NOT NULL,
  is_view_once BOOLEAN DEFAULT TRUE NOT NULL,
  is_viewed BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  content TEXT,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  request_id UUID REFERENCES public.friend_requests(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- BLOCKED USERS
CREATE TABLE public.blocked_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT blocked_users_unique UNIQUE (blocker_id, blocked_id)
);

-- REPORTS (Denuncias)
CREATE TABLE public.reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_number TEXT UNIQUE,
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  reason report_reason NOT NULL,
  details TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'removed')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT report_target_check CHECK (
    (target_user_id IS NOT NULL AND target_post_id IS NULL) OR
    (target_user_id IS NULL AND target_post_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX unique_user_report ON public.reports (reporter_id, target_user_id) WHERE target_user_id IS NOT NULL;
CREATE UNIQUE INDEX unique_post_report ON public.reports (reporter_id, target_post_id) WHERE target_post_id IS NOT NULL;


-- ==========================================
-- 4. FUNCIONES DE APOYO Y TRIGGERS
-- ==========================================

-- Function: get_my_chats (Evita recursión en RLS de chats)
CREATE OR REPLACE FUNCTION public.get_my_chats()
RETURNS SETOF UUID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT chat_id FROM public.chat_participants WHERE user_id = auth.uid();
$$;

-- Function & Trigger: Crear Perfil Automático al registrarse usuario en Auth
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  default_username TEXT;
  default_avatar_url TEXT;
BEGIN
  default_username := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  default_avatar_url := 'https://api.dicebear.com/7.x/adventurer/svg?seed=' || default_username || '&backgroundColor=b6e3f4';

  INSERT INTO public.profiles (id, username, avatar_url, avatar_config)
  VALUES (
    NEW.id,
    default_username,
    default_avatar_url,
    jsonb_build_object(
      'styleId', 'adventurer',
      'options', jsonb_build_object('seed', default_username, 'backgroundColor', ARRAY['b6e3f4'])
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- Function & Trigger: Autogenerar folio de reporte (RP-0001)
CREATE OR REPLACE FUNCTION public.generate_report_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.report_number := 'RP-' || LPAD(nextval('report_number_seq')::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_report_number
  BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.generate_report_number();

-- Function & Trigger: Notificación por Like
CREATE OR REPLACE FUNCTION public.on_new_like()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.notifications (user_id, actor_id, type, content, post_id)
  VALUES (
    (SELECT user_id FROM public.posts WHERE id = NEW.post_id),
    NEW.user_id,
    'like',
    'le dio me gusta a tu post.',
    NEW.post_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_after_like
  AFTER INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.on_new_like();

-- Function & Trigger: Notificación por Comentario
CREATE OR REPLACE FUNCTION public.handle_new_comment_notification()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id UUID;
BEGIN
  SELECT user_id INTO target_user_id FROM public.posts WHERE id = NEW.post_id;
  IF target_user_id != NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, post_id, content)
    VALUES (target_user_id, NEW.user_id, 'COMMENT', NEW.post_id, NEW.content);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_comment_created
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_comment_notification();

-- Function & Trigger: Notificación por Solicitud de Amistad + Push vía Expo
CREATE OR REPLACE FUNCTION public.handler_new_friend_request()
RETURNS TRIGGER AS $$
DECLARE
  target_token TEXT;
  sender_name TEXT;
BEGIN
  -- 1. Insertar notificación interna
  INSERT INTO public.notifications (user_id, actor_id, type, content, request_id)
  VALUES (NEW.to_id, NEW.from_id, 'friend_request', 'quiere conectar con tu Vault.', NEW.id);

  -- 2. Enviar Push a Expo si existe el token
  SELECT expo_push_token INTO target_token FROM public.profiles WHERE id = NEW.to_id;
  SELECT username INTO sender_name FROM public.profiles WHERE id = NEW.from_id;

  IF target_token IS NOT NULL THEN
    PERFORM extensions.http_post(
      'https://exp.host/--/api/v2/push/send',
      json_build_object(
        'to', target_token,
        'title', '💎 Nimly Vault',
        'body', '@' || COALESCE(sender_name, 'Alguien') || ' quiere establecer una conexión.',
        'sound', 'default',
        'data', json_build_object('type', 'friend_request', 'from_id', NEW.from_id)
      )::text,
      'application/json'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_create_notification_on_request
  AFTER INSERT ON public.friend_requests
  FOR EACH ROW EXECUTE FUNCTION public.handler_new_friend_request();

-- Function & Trigger: Actualización de Notificación al Aceptar Amistad
CREATE OR REPLACE FUNCTION public.handler_accept_friend_request_sync()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'ACCEPTED' THEN
    UPDATE public.notifications
    SET content = 'is now your friend.', is_read = true
    WHERE request_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_sync_accept_notif
  AFTER UPDATE ON public.friend_requests
  FOR EACH ROW EXECUTE FUNCTION public.handler_accept_friend_request_sync();

-- RPC: Destruir conexión de amistad y eliminar chat/mensajes completamente
CREATE OR REPLACE FUNCTION public.sever_connection_and_wipe_chat(user_a UUID, user_b UUID)
RETURNS VOID AS $$
DECLARE
  shared_chat_id UUID;
BEGIN
  SELECT cp1.chat_id INTO shared_chat_id
  FROM public.chat_participants cp1
  JOIN public.chat_participants cp2 ON cp1.chat_id = cp2.chat_id
  WHERE cp1.user_id = user_a AND cp2.user_id = user_b;

  DELETE FROM public.notifications
  WHERE request_id IN (
    SELECT id FROM public.friend_requests
    WHERE (from_id = user_a AND to_id = user_b) OR (from_id = user_b AND to_id = user_a)
  );

  IF shared_chat_id IS NOT NULL THEN
    DELETE FROM public.messages WHERE chat_id = shared_chat_id;
    DELETE FROM public.chat_participants WHERE chat_id = shared_chat_id;
    DELETE FROM public.chats WHERE id = shared_chat_id;
  END IF;

  DELETE FROM public.friends
  WHERE (user_id = user_a AND friend_id = user_b) OR (user_id = user_b AND friend_id = user_a);

  DELETE FROM public.friend_requests
  WHERE (from_id = user_a AND to_id = user_b) OR (from_id = user_b AND to_id = user_a);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Eliminar cuenta de usuario
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;


-- ==========================================
-- 5. VISTAS DEFINITIVAS
-- ==========================================
CREATE VIEW public.posts_with_stats WITH (security_invoker = true) AS
SELECT 
  p.*,
  pr.username,
  pr.avatar_config,
  (SELECT COUNT(*)::INT FROM public.comments c WHERE c.post_id = p.id) AS comments_count,
  (SELECT COUNT(*)::INT FROM public.likes l WHERE l.post_id = p.id) AS likes_count,
  EXISTS (
    SELECT 1 FROM public.likes l 
    WHERE l.post_id = p.id AND l.user_id = auth.uid()
  ) AS is_liked_by_me
FROM public.posts p
LEFT JOIN public.profiles pr ON p.user_id = pr.id;


-- ==========================================
-- 6. HABILITACIÓN DE RLS Y POLÍTICAS DE SEGURIDAD
-- ==========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE POLICY "policy_profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "policy_profiles_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "policy_profiles_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- POSTS
CREATE POLICY "policy_posts_select" ON public.posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "policy_posts_insert" ON public.posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "policy_posts_delete" ON public.posts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- LIKES
CREATE POLICY "policy_likes_select" ON public.likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "policy_likes_all" ON public.likes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- COMMENTS
CREATE POLICY "policy_comments_select" ON public.comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "policy_comments_insert" ON public.comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "policy_comments_delete" ON public.comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- FRIEND REQUESTS
CREATE POLICY "policy_friend_requests_select" ON public.friend_requests FOR SELECT TO authenticated USING (auth.uid() = from_id OR auth.uid() = to_id);
CREATE POLICY "policy_friend_requests_insert" ON public.friend_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = from_id);
CREATE POLICY "policy_friend_requests_update" ON public.friend_requests FOR UPDATE TO authenticated USING (auth.uid() = to_id);

-- FRIENDS
CREATE POLICY "policy_friends_select" ON public.friends FOR SELECT TO authenticated USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "policy_friends_insert" ON public.friends FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "policy_friends_delete" ON public.friends FOR DELETE TO authenticated USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- CHATS & PARTICIPANTS
CREATE POLICY "policy_chats_select" ON public.chats FOR SELECT TO authenticated USING (id IN (SELECT public.get_my_chats()));
CREATE POLICY "policy_chats_insert" ON public.chats FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "policy_participants_select" ON public.chat_participants FOR SELECT TO authenticated USING (chat_id IN (SELECT public.get_my_chats()));
CREATE POLICY "policy_participants_insert" ON public.chat_participants FOR INSERT TO authenticated WITH CHECK (true);

-- MESSAGES & MEDIA
CREATE POLICY "policy_messages_select" ON public.messages FOR SELECT TO authenticated USING (chat_id IN (SELECT public.get_my_chats()));
CREATE POLICY "policy_messages_insert" ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "policy_messages_update_read" ON public.messages FOR UPDATE TO authenticated USING (chat_id IN (SELECT public.get_my_chats())) WITH CHECK (is_read = true);

CREATE POLICY "policy_messages_media_select" ON public.messages_media FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.chat_participants cp
    JOIN public.messages m ON m.chat_id = cp.chat_id
    WHERE m.id = messages_media.message_id AND cp.user_id = auth.uid()
  )
);

-- NOTIFICATIONS
CREATE POLICY "policy_notifications_select" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "policy_notifications_insert" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "policy_notifications_update" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- REPORTS
CREATE POLICY "policy_reports_insert" ON public.reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);


-- ==========================================
-- 7. STORAGE BUCKETS Y SUS POLÍTICAS
-- ==========================================

-- Bucket 1: media (General)
INSERT INTO storage.buckets (id, name, public) VALUES ('media', 'media', true) ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Permitir subida a usuarios autenticados" ON storage.objects;
DROP POLICY IF EXISTS "Permitir lectura publica" ON storage.objects;
DROP POLICY IF EXISTS "Solo amigos pueden ver las fotos" ON storage.objects;

CREATE POLICY "Permitir subida a usuarios autenticados" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'media');
CREATE POLICY "Permitir lectura publica" ON storage.objects FOR SELECT TO public USING (bucket_id = 'media');

-- Bucket 2: chat-media (Encriptado / Efímero por chat)
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-media', 'chat-media', false) ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "policy_upload_chat_media" ON storage.objects;
DROP POLICY IF EXISTS "policy_view_chat_media" ON storage.objects;
DROP POLICY IF EXISTS "policy_delete_chat_media" ON storage.objects;

CREATE POLICY "policy_upload_chat_media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'chat-media' AND (storage.foldername(name))[1] IN (SELECT chat_id::text FROM public.chat_participants WHERE user_id = auth.uid())
);

CREATE POLICY "policy_view_chat_media" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'chat-media' AND (storage.foldername(name))[1] IN (SELECT chat_id::text FROM public.chat_participants WHERE user_id = auth.uid())
);

CREATE POLICY "policy_delete_chat_media" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'chat-media' AND (storage.foldername(name))[1] IN (SELECT chat_id::text FROM public.chat_participants WHERE user_id = auth.uid())
);


-- ==========================================
-- 8. REALTIME Y REFRESH DE ESQUEMA
-- ==========================================
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;

-- Notificar a PostgREST para refrescar el schema cache inmediatamente
NOTIFY pgrst, 'reload schema';