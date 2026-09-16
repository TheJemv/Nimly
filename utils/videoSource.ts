import type { BufferOptions, VideoSource } from "expo-video";

/**
 * Aggressive feed-style buffer: starts as soon as there's a first frame instead
 * of waiting to gather seconds of video (iOS `automaticallyWaitsToMinimizeStalling`).
 * Cuts cold start by ~0.8s. On bad networks there can be a brief initial
 * micro-stall; for short clips this almost never happens, and the MP4 fallback
 * covers the rest.
 */
export const FAST_START_BUFFER: BufferOptions = {
    preferredForwardBufferDuration: 3,
    waitsToMinimizeStalling: false,
    minBufferForPlayback: 1,
};

/**
 * Base of the self-hosted media API that serves the authenticated HLS
 * playlist for posts and stories. The segments come embedded as Supabase
 * signed URLs (valid 6h) and are served directly by Supabase, not this endpoint.
 */
export const MEDIA_API_BASE =
    process.env.EXPO_PUBLIC_MEDIA_API_BASE ?? "https://media.platosmart.com";

interface BuildVideoSourceOpts {
    /** Owner of the post/story (the route's `{user_id}`). */
    ownerId?: string | null;
    /** Id of the post or story (the route's `{id}`). */
    mediaId?: string | null;
    /** `posts.playback_status` / `stories.playback_status`: 'raw' | 'ready' | 'error'. */
    playbackStatus?: string | null;
    /** Signed URL of the original MP4 (private bucket). The always-available fallback. */
    mp4Url?: string | null;
    /** access_token of the Supabase session. Sent as the `Authorization` header. */
    accessToken?: string | null;
    /** If the player already choked on HLS: we force the MP4. */
    hlsFailed?: boolean;
}

/**
 * Decides the player source for a post/story video:
 *
 * - `playback_status === 'ready'` (already transcoded) + there's a token + it
 *   hasn't failed before
 *   → HLS object authenticated by the media API. `expo-video` sends the
 *     `Authorization` header both to the playlist and to each segment
 *     (verified on iOS via `AVURLAssetHTTPHeaderFieldsKey` and on Android via OkHttp).
 * - Any other case ('raw', 'error', no token, or `hlsFailed`)
 *   → the MP4 signed URL string, exactly as before.
 *
 * A post/story NEVER breaks or gets hidden because of the transcode state.
 */
const prefetched = new Set<string>();

/**
 * Warms up HLS playback for a post/story BEFORE it reaches the screen:
 *   1. opens a (TLS) connection to the media API and leaves it in the pool -> AVPlayer reuses it
 *   2. forces the API to validate permissions + sign the segments right away
 *   3. touches the first segment (Range 0-1) -> warms up TLS to Storage
 *
 * Fully best-effort: any failure is swallowed. Once per id per session.
 * Cuts the cold start (~0.8s) of the first video you see in the feed.
 */
export async function prefetchHls(
    opts: { id?: string | null; ownerId?: string | null; playbackStatus?: string | null },
    accessToken?: string | null,
): Promise<void> {
    const { id, ownerId, playbackStatus } = opts;
    if (!id || !ownerId || !accessToken || playbackStatus !== "ready" || prefetched.has(id)) return;
    prefetched.add(id);

    const tag = String(id).slice(0, 8);
    try {
        const res = await fetch(`${MEDIA_API_BASE}/media/${ownerId}/${id}/index.m3u8`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
            if (__DEV__) console.log(`[hls:prefetch] ${tag} playlist ${res.status}`);
            return;
        }
        const firstSeg = (await res.text())
            .split("\n")
            .map((l) => l.trim())
            .find((l) => l.length > 0 && !l.startsWith("#"));
        if (firstSeg) {
            await fetch(firstSeg, { headers: { Range: "bytes=0-1" } }).catch(() => {});
        }
        if (__DEV__) console.log(`[hls:prefetch] ${tag} ready`);
    } catch {
        /* best-effort */
    }
}

export function buildVideoSource(opts: BuildVideoSourceOpts): VideoSource {
    const { ownerId, mediaId, playbackStatus, mp4Url, accessToken, hlsFailed } = opts;

    if (playbackStatus === "ready" && ownerId && mediaId && accessToken && !hlsFailed) {
        return {
            uri: `${MEDIA_API_BASE}/media/${ownerId}/${mediaId}/index.m3u8`,
            headers: { Authorization: `Bearer ${accessToken}` },
            contentType: "hls",
        };
    }

    return mp4Url ?? null;
}
