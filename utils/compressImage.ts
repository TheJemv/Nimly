import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';

/**
 * Image quality presets by destination. High-factor JPEG: the "looks
 * pixelated / washed out" issue came from dropping `compress` (0.7) and width too low.
 *
 *  - `post`   feed: up to 2400px, q0.92. Sharp; the width cap avoids uploading
 *             the camera's 4000px+ RAW.
 *  - `story`  full vertical screen: up to 1440px, q0.88.
 */
export const IMAGE_QUALITY = {
    post: { maxWidth: 2400, compress: 0.92 },
    story: { maxWidth: 1440, compress: 0.88 },
} as const;

export type ImageQualityPreset = { maxWidth: number; compress: number };

const getWidth = (uri: string): Promise<number> =>
    new Promise((resolve) => {
        Image.getSize(uri, (w) => resolve(w), () => resolve(0));
    });

/**
 * Normalizes an image for upload: it's rescaled ONLY if it exceeds `maxWidth`
 * (never upscaled), then re-compressed to JPEG using the preset's factor.
 *
 * Never throws: if something fails, it returns the original uri.
 */
export async function optimizeImageForUpload(
    uri: string,
    preset: ImageQualityPreset,
): Promise<string> {
    try {
        const width = await getWidth(uri);
        const actions: ImageManipulator.Action[] =
            width > preset.maxWidth ? [{ resize: { width: preset.maxWidth } }] : [];

        const result = await ImageManipulator.manipulateAsync(uri, actions, {
            compress: preset.compress,
            format: ImageManipulator.SaveFormat.JPEG,
        });
        return result.uri;
    } catch (e) {
        console.warn('Image optimize failed, using original:', e);
        return uri;
    }
}
