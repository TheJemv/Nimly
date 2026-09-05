/**
 * Comprime un video a ~720p antes de subirlo. Un clip de 13s que pesaba
 * ~26MB baja a ~3-4MB. De paso re-codifica a H.264/SDR, así que también
 * ayuda con el brillo raro del video HDR.
 *
 * Nunca lanza: si la compresión falla, devuelve el uri original para no
 * bloquear el envío (subir 26MB es mejor que no subir nada).
 *
 * El módulo nativo se carga en diferido -- así, si corre sobre un binario
 * que todavía no lo tiene (ej. un OTA sobre una build vieja), no truena ni
 * ensucia el arranque; simplemente cae al fallback.
 */
export async function compressVideoForUpload(
    uri: string,
    onProgress?: (progress: number) => void,
): Promise<string> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { Video } = require('react-native-compressor') as typeof import('react-native-compressor');
        const output = await Video.compress(
            uri,
            {
                compressionMethod: 'manual',
                maxSize: 1280,       // limita el lado más largo -> 720p (1280x720 / 720x1280)
                bitrate: 2_000_000,  // 2 Mbps: buena calidad a 720p, archivo chico
            },
            onProgress,
        );
        return output || uri;
    } catch (e) {
        console.warn('Video compression failed, using original:', e);
        return uri;
    }
}
