import { getThemeColor } from '@/constants/theme';
import { parseGifContent } from '@/utils/chatUtils';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import React, { memo, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

const MAX_WIDTH = 240;
const MAX_HEIGHT = 300;
const MIN_WIDTH = 120;

interface Props {
    content: string;
    /** Box the GIF is fitted into (chat bubble size by default). */
    maxWidth?: number;
    maxHeight?: number;
}

/** A GIF message: the GIF at its own aspect ratio, no bubble behind it. */
export const GifMessageBubble = memo(({ content, maxWidth = MAX_WIDTH, maxHeight = MAX_HEIGHT }: Props) => {
    const gif = useMemo(() => parseGifContent(content), [content]);
    const [failed, setFailed] = useState(false);

    if (!gif || failed) {
        return (
            <View style={styles.unavailable}>
                <SymbolView name="photo.badge.exclamationmark" size={16} tintColor={getThemeColor('textSecondary')} />
                <Text style={styles.unavailableText}>GIF unavailable</Text>
            </View>
        );
    }

    // Sized from the dimensions stored with the URL, so the row doesn't jump
    // when the GIF finishes loading. Square if they're missing.
    const ratio = gif.width && gif.height ? gif.width / gif.height : 1;
    let width = maxWidth;
    let height = width / ratio;
    if (height > maxHeight) {
        height = maxHeight;
        width = Math.max(MIN_WIDTH, height * ratio);
    }

    return (
        <View style={[styles.container, { width, height }]} accessibilityRole="image" accessibilityLabel="GIF">
            <Image
                source={{ uri: gif.url }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={150}
                onError={() => setFailed(true)}
            />
        </View>
    );
});

GifMessageBubble.displayName = 'GifMessageBubble';

const styles = StyleSheet.create({
    container: { borderRadius: 15, overflow: 'hidden', backgroundColor: getThemeColor('surface') },
    unavailable: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 18,
        backgroundColor: getThemeColor('surface'),
    },
    unavailableText: { color: getThemeColor('textSecondary'), fontSize: 14 },
});
