-- Verified photo posts.
--
-- A photo post is verified when its author shows up in it: the app asks Nimly Face
-- (/identify, with only the author as candidate) before uploading and sends
-- `is_verified = true` on insert. The post shows a "Verified" badge on the photo.
--
-- posts_with_stats is the production definition plus `is_verified` at the end (a
-- replaced view can only add columns at the end). get_friends_posts returns `p.*`
-- from it, so it picks the column up on its own. The view has no reloptions, so
-- replacing it loses nothing.

alter table public.posts
  add column if not exists is_verified boolean not null default false;

create or replace view public.posts_with_stats as
select p.id,
    p.user_id,
    p.type,
    p.content,
    p.media_url,
    p.created_at,
    p.hls_path,
    p.playback_status,
    pr.username,
    pr.avatar_config,
    coalesce(l.likes_count, 0::bigint) as likes_count,
    coalesce(c.comments_count, 0::bigint) as comments_count,
    (exists ( select 1
           from likes lk
          where lk.post_id = p.id and lk.user_id = auth.uid())) as is_liked_by_me,
    p.is_verified
   from posts p
     left join profiles pr on p.user_id = pr.id
     left join ( select likes.post_id,
            count(*) as likes_count
           from likes
          group by likes.post_id) l on p.id = l.post_id
     left join ( select comments.post_id,
            count(*) as comments_count
           from comments
          group by comments.post_id) c on p.id = c.post_id;

notify pgrst, 'reload schema';
