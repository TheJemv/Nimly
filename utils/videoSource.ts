import type { BufferOptions, VideoSource } from "expo-video";

/**
 * Buffer agresivo tipo feed: arranca apenas hay primer frame en vez de esperar
 * a juntar segundos de video (iOS `automaticallyWaitsToMinimizeStalling`). Baja
 * el arranque en frío de ~0.8s. En red mala puede haber un micro-stall inicial;
 * para clips cortos casi nunca pasa y el fallback a MP4 cubre lo demás.
 */
export const FAST_START_BUFFER: BufferOptions = {
    preferredForwardBufferDuration: 3,
    waitsToMinimizeStalling: false,
    minBufferForPlayback: 1,
};

/**
 * Base del media API self-hosted que sirve el playlist HLS autenticado de
 * posts y stories. Los segmentos vienen embebidos como signed URLs de Supabase
 * (válidas 6h) y los sirve Supabase directo, no este endpoint.
 */
export const MEDIA_API_BASE =
    process.env.EXPO_PUBLIC_MEDIA_API_BASE ?? "https://media.platosmart.com";

interface BuildVideoSourceOpts {
    /** Dueño del post/story (el `{user_id}` de la ruta). */
    ownerId?: string | null;
    /** Id del post o de la story (el `{id}` de la ruta). */
    mediaId?: string | null;
    /** `posts.playback_status` / `stories.playback_status`: 'raw' | 'ready' | 'error'. */
    playbackStatus?: string | null;
    /** Signed URL del MP4 original (bucket privado). El fallback de siempre. */
    mp4Url?: string | null;
    /** access_token de la sesión de Supabase. Va como `Authorization` header. */
    accessToken?: string | null;
    /** Si el player ya reventó con HLS: forzamos el MP4. */
    hlsFailed?: boolean;
}

/**
 * Decide la fuente del player de un video de post/story:
 *
 * - `playback_status === 'ready'` (ya transcodeado) + hay token + no falló antes
 *   → objeto HLS autenticado por el media API. `expo-video` manda el header
 *     `Authorization` tanto al playlist como a cada segmento (verificado en
 *     iOS `AVURLAssetHTTPHeaderFieldsKey` y Android OkHttp).
 * - Cualquier otro caso ('raw', 'error', sin token, o `hlsFailed`)
 *   → el string del signed URL del MP4, exactamente como antes.
 *
 * Un post/story NUNCA se rompe ni se oculta por el estado del transcode.
 */
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
