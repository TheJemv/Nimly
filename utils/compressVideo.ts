/**
 * Presets de compresión de video por destino. El servidor luego hace un
 * transcode a HLS para streaming, así que esto define la calidad *fuente*: si
 * subes 480p/2Mbps, el stream nunca puede verse mejor que eso.
 *
 *  - `feed`  posts e historias: 1080p, bitrate alto. Se ve nítido.
 *  - `chat`  mensajes E2EE: el video se mete en RAM como base64 antes de cifrar,
 *            así que se mantiene más contenido (720p) para no inflar la memoria.
 */
export const VIDEO_QUALITY = {
    feed: { maxSize: 1920, bitrate: 5_500_000 },
    chat: { maxSize: 1280, bitrate: 3_500_000 },
} as const;

export type VideoQualityPreset = { maxSize: number; bitrate: number };

/**
 * Comprime un video antes de subirlo. Un clip de 12s en `feed` (1080p/5.5Mbps)
 * pesa ~8-9MB; en `chat` (720p/3.5Mbps) ~5MB. De paso re-codifica a H.264/SDR,
 * así que también corrige el brillo raro del HDR.
 *
 * Nunca lanza: si la compresión falla, devuelve el uri original para no
 * bloquear el envío (subir el original es mejor que no subir nada).
 *
 * El módulo nativo se carga en diferido -- así, si corre sobre un binario
 * que todavía no lo tiene (ej. un OTA sobre una build vieja), no truena ni
 * ensucia el arranque; simplemente cae al fallback.
 */
export async function compressVideoForUpload(
    uri: string,
    preset: VideoQualityPreset = VIDEO_QUALITY.chat,
    onProgress?: (progress: number) => void,
): Promise<string> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { Video } = require('react-native-compressor') as typeof import('react-native-compressor');
        const output = await Video.compress(
            uri,
            {
                compressionMethod: 'manual',
                maxSize: preset.maxSize,
                bitrate: preset.bitrate,
            },
            onProgress,
        );
        return output || uri;
    } catch (e) {
        console.warn('Video compression failed, using original:', e);
        return uri;
    }
}

/**
 * Devuelve una copia del video SIN pista de audio, ya en specs de subida de
 * feed (1080p), así el `compressVideoForUpload` de después casi no re-procesa.
 *
 * Nunca lanza: si algo falla devuelve el uri original (con audio) para no
 * bloquear el envío. Módulo nativo cargado en diferido, igual que arriba.
 */
export async function stripVideoAudio(uri: string): Promise<string> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { Video } = require('react-native-compressor') as typeof import('react-native-compressor');
        const output = await Video.compress(uri, {
            compressionMethod: 'manual',
            maxSize: VIDEO_QUALITY.feed.maxSize,
            bitrate: VIDEO_QUALITY.feed.bitrate,
            stripAudio: true,
        });
        return output || uri;
    } catch (e) {
        console.warn('Could not strip audio, keeping original:', e);
        return uri;
    }
}
