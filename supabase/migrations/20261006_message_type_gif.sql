-- GIF messages picked from KLIPY.
--
-- `content` holds the GIF's public URL as-is (not encrypted: it's a public
-- asset), with its pixel size after `#` (e.g. `…/abc.gif#w=268&h=200`) so the
-- bubble can be laid out before the GIF loads. The fragment never reaches the
-- server when the URL is fetched.

alter type public.message_content_type add value if not exists 'gif';
