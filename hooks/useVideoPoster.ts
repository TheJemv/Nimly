import { useEffect, useState } from "react";
import type { VideoPlayer, VideoThumbnail } from "expo-video";

/**
 * Portadas (primer frame) de videos de post/story, cacheadas por id de media.
 * La caché vive lo que dure la sesión, así que al hacer scroll de vuelta a un
 * video del feed o al reabrir el viewer de historias la portada aparece al
 * instante en vez de un rectángulo negro mientras el player bufferea.
 */
const posterCache = new Map<string, VideoThumbnail>();

/**
 * Devuelve la portada del video en cuanto el player tiene datos suficientes
 * (`readyToPlay`). Best-effort total: si `generateThumbnailsAsync` falla
 * (HLS sin key-frame accesible, player liberado, web) simplemente no hay
 * portada y el consumidor cae a su placeholder de siempre.
 *
 * @param player   el mismo `useVideoPlayer` que ya usa el componente, o `null`
 *                 cuando el media no es video.
 * @param mediaId  id del post o de la story (clave de caché).
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
            /* player liberado */
        }

        return () => {
            cancelled = true;
            try { sub?.remove(); } catch { /* liberado */ }
        };
    }, [player, mediaId]);

    return poster;
}
