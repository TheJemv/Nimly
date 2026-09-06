import { useEffect, useRef } from "react";
import type { VideoSource } from "expo-video";

/** Igual que el `-hls_time` del transcoder. Cada segmento .ts dura esto. */
const SEGMENT_SECONDS = 4;

/**
 * Log de progreso de descarga HLS. SOLO corre en __DEV__.
 *
 * expo-video NO expone un evento por segmento (AVPlayer / ExoPlayer bajan los
 * .ts en código nativo y no lo avisan a JS). Aproximamos: cada vez que
 * `bufferedPosition` cruza un múltiplo de la duración de segmento, ese
 * segmento ya entró al buffer -> lo logueamos.
 *
 * Para ver los `GET .../seg_NNN.ts` reales: Proxyman o Charles.
 */
export function useHlsSegmentLog(
    player: any,
    source: VideoSource,
    label: string,
): void {
    const lastSeg = useRef(-1);

    const isHls = typeof source === "object" && source !== null && (source as any).contentType === "hls";
    const uri = typeof source === "object" && source !== null ? (source as any).uri : source;

    useEffect(() => {
        if (!__DEV__ || !player || !isHls) return;

        lastSeg.current = -1;
        console.log(`[hls:${label}] source -> ${uri}`);

        const subs: { remove: () => void }[] = [];
        try {
            try { player.timeUpdateEventInterval = 0.5; } catch { /* noop */ }

            const s1 = player.addListener?.("statusChange", ({ status, error }: any) => {
                console.log(`[hls:${label}] status=${status}${error ? ` err=${error?.message ?? error}` : ""}`);
            });
            if (s1) subs.push(s1);

            const s2 = player.addListener?.("timeUpdate", ({ currentTime, bufferedPosition }: any) => {
                const buffered = bufferedPosition ?? 0;
                const seg = Math.floor(buffered / SEGMENT_SECONDS);
                if (seg > lastSeg.current) {
                    for (let s = lastSeg.current + 1; s <= seg; s++) {
                        console.log(
                            `[hls:${label}] segment ~${String(s).padStart(3, "0")} en buffer ` +
                            `(buffered=${buffered.toFixed(1)}s · playhead=${(currentTime ?? 0).toFixed(1)}s)`,
                        );
                    }
                    lastSeg.current = seg;
                }
            });
            if (s2) subs.push(s2);

            const s3 = player.addListener?.("playToEnd", () => {
                console.log(`[hls:${label}] playToEnd`);
            });
            if (s3) subs.push(s3);
        } catch (e) {
            console.log(`[hls:${label}] no pude enganchar listeners`, e);
        }

        return () => { subs.forEach((s) => { try { s.remove(); } catch { /* noop */ } }); };
    }, [player, isHls, uri, label]);
}
