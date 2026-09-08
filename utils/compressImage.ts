import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';

/**
 * Presets de calidad de imagen por destino. JPEG con factor alto: el "se ve
 * pixelado / lavado" venía de bajar demasiado el `compress` (0.7) y el ancho.
 *
 *  - `post`   feed: hasta 2400px, q0.92. Nítido; el tope de ancho evita subir
 *             el RAW de 4000px+ de la cámara.
 *  - `story`  pantalla completa vertical: hasta 1440px, q0.88.
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
 * Normaliza una imagen para subir: la reescala SOLO si supera `maxWidth` (nunca
 * la agranda) y la re-comprime a JPEG con el factor del preset.
 *
 * Nunca lanza: si algo falla devuelve el uri original.
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
