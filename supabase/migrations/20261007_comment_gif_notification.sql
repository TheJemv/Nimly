-- GIF comments.
--
-- A GIF comment's `content` is the GIF's KLIPY URL with its size after `#`,
-- same as GIF chat messages. The comment notification copied `content` as-is,
-- so the notifications list and the push (send-push uses `content` as the
-- body) showed the raw URL. Now they say "commented with a GIF".
--
-- GIF posts need no migration: `media_url` holds the KLIPY URL, which doesn't
-- match `_is_video_path`, so `enqueue_post_transcode` skips it.

create or replace function public.handle_new_comment_notification()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  target_user_id UUID;
BEGIN
  SELECT user_id INTO target_user_id FROM public.posts WHERE id = NEW.post_id;
  IF target_user_id != NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, post_id, content)
    VALUES (
      target_user_id, NEW.user_id, 'COMMENT', NEW.post_id,
      CASE WHEN NEW.content LIKE 'https://static.klipy.com/%' THEN 'commented with a GIF' ELSE NEW.content END
    );
  END IF;
  RETURN NEW;
END;
$function$;
