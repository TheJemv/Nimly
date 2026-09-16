/**
 * Video compression presets by destination. The server later transcodes to
 * HLS for streaming, so this defines the *source* quality: if you upload
 * 480p/2Mbps, the stream can never look better than that.
 *
 *  - `feed`  posts and stories: 1080p, high bitrate. Looks sharp.
 *  - `chat`  E2EE messages: the video gets loaded into RAM as base64 before
 *            encrypting, so it's kept smaller (720p) to avoid bloating memory.
 */
export const VIDEO_QUALITY = {
    feed: { maxSize: 1920, bitrate: 5_500_000 },
    chat: { maxSize: 1280, bitrate: 3_500_000 },
} as const;

export type VideoQualityPreset = { maxSize: number; bitrate: number };

/**
 * Compresses a video before uploading. A 12s clip in `feed` (1080p/5.5Mbps)
 * weighs ~8-9MB; in `chat` (720p/3.5Mbps) ~5MB. Along the way it re-encodes to
 * H.264/SDR, which also fixes the odd HDR brightness.
 *
 * Never throws: if compression fails, it returns the original uri so it
 * doesn't block sending (uploading the original is better than uploading nothing).
 *
 * The native module is lazy-loaded -- this way, if it runs on a binary that
 * doesn't have it yet (e.g. an OTA update over an old build), it doesn't crash
 * or pollute startup; it simply falls back.
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
 * Returns a copy of the video WITHOUT an audio track, already at feed upload
 * specs (1080p), so the subsequent `compressVideoForUpload` barely has to reprocess it.
 *
 * Never throws: if something fails, it returns the original uri (with audio)
 * so it doesn't block sending. Native module lazy-loaded, same as above.
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
