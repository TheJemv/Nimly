import { useEffect, useRef } from "react";
import type { VideoSource } from "expo-video";

/** Same as the transcoder's `-hls_time`. Each .ts segment lasts this long. */
const SEGMENT_SECONDS = 4;

/**
 * HLS download progress log. ONLY runs in __DEV__.
 *
 * expo-video does NOT expose a per-segment event (AVPlayer / ExoPlayer download
 * the .ts files in native code and don't notify JS). We approximate: every time
 * `bufferedPosition` crosses a multiple of the segment duration, that segment
 * has already entered the buffer -> we log it.
 *
 * To see the actual `GET .../seg_NNN.ts` requests: Proxyman or Charles.
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
                if (buffered <= 0) return; // nothing downloaded yet: don't invent segment 0
                const seg = Math.floor(buffered / SEGMENT_SECONDS);
                if (seg > lastSeg.current) {
                    for (let s = lastSeg.current + 1; s <= seg; s++) {
                        console.log(
                            `[hls:${label}] segment ~${String(s).padStart(3, "0")} in buffer ` +
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
            console.log(`[hls:${label}] could not attach listeners`, e);
        }

        return () => { subs.forEach((s) => { try { s.remove(); } catch { /* noop */ } }); };
    }, [player, isHls, uri, label]);
}
