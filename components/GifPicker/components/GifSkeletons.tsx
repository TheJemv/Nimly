import React from 'react';
import { View } from 'react-native';
import { CATEGORY_HEIGHT, styles } from '../GifPicker.styles';

// Static and fading out on purpose, like the stories tray placeholder.
const ROW_OPACITY = [0.9, 0.65, 0.45, 0.28, 0.15];
// Uneven heights so the placeholder already reads as a masonry of GIFs.
const GIF_HEIGHTS = [[150, 110, 170, 120], [115, 165, 125, 150]];

interface Props {
    variant: 'categories' | 'gifs';
    header?: React.ReactNode;
    bottomInset: number;
}

export function GifGridSkeleton({ variant, header, bottomInset }: Props) {
    const columns = variant === 'categories'
        ? [0, 1].map(() => ROW_OPACITY.map(() => CATEGORY_HEIGHT))
        : GIF_HEIGHTS;

    return (
        <View style={[styles.gridContent, { paddingBottom: bottomInset }]}>
            {header}
            <View style={styles.skeletonColumns}>
                {columns.map((heights, c) => (
                    <View key={c} style={styles.skeletonColumn}>
                        {heights.map((height, r) => (
                            <View key={r} style={[styles.skeletonTile, { height, opacity: ROW_OPACITY[r] }]} />
                        ))}
                    </View>
                ))}
            </View>
        </View>
    );
}
