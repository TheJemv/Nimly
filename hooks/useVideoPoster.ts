import { useEffect, useState } from "react";
import type { VideoPlayer, VideoThumbnail } from "expo-video";

/**
 * Post/story video posters (first frame), cached by media id.
 * The cache lives for the duration of the session, so scrolling back to a
 * video in the feed or reopening the story viewer shows the poster instantly
 * instead of a black rectangle while the player buffers.
 */
const posterCache = new Map<string, VideoThumbnail>();

/**
 * Returns the video's poster as soon as the player has enough data
 * (`readyToPlay`). Fully best-effort: if `generateThumbnailsAsync` fails
 * (HLS with no accessible key-frame, player released, web) there's simply no
 * poster and the consumer falls back to its usual placeholder.
 *
 * @param player   the same `useVideoPlayer` the component already uses, or
 *                 `null` when the media isn't a video.
 * @param mediaId  id of the post or story (cache key).
 */
export function useVideoPoster(player: VideoPlayer | null, mediaId?: string | null): VideoThumbnail | null {
    const [poster, setPoster] = useState<VideoThumbnail | null>(
        mediaId ? posterCache.get(mediaId) ?? null : null,
    );

    useEffect(() => {
        setPoster(mediaId ? posterCache.get(mediaId) ?? null : null);
    }, [mediaId]);

    useEffect(() => {
        if (!player || !mediaId || posterCache.has(mediaId)) return;

        let cancelled = false;

        const grab = async () => {
            if (cancelled || posterCache.has(mediaId)) return;
            try {
                if (player.status !== "readyToPlay") return;
                const [thumb] = await player.generateThumbnailsAsync([0]);
                if (thumb && !cancelled) {
                    posterCache.set(mediaId, thumb);
                    setPoster(thumb);
                }
            } catch {
                /* best-effort */
            }
        };

        grab();
        let sub: { remove: () => void } | undefined;
        try {
            sub = player.addListener?.("statusChange", grab);
        } catch {
            /* player released */
        }

        return () => {
            cancelled = true;
            try { sub?.remove(); } catch { /* released */ }
        };
    }, [player, mediaId]);

    return poster;
}
