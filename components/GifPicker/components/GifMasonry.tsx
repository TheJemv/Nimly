import type { KlipyGif } from '@/api/klipy/gifs';
import { getThemeColor } from '@/constants/theme';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { GRID_GAP, GRID_PADDING, styles } from '../GifPicker.styles';

// The visible window is recomputed in steps of this many px of scroll, so
// scrolling doesn't re-render the grid on every frame.
const WINDOW_STEP = 300;

interface Tile {
    gif: KlipyGif;
    url?: string;
    top: number;
    left: number;
    height: number;
}

interface Props {
    gifs: KlipyGif[];
    header?: React.ReactNode;
    loadingMore: boolean;
    bottomInset: number;
    onEndReached: () => void;
    onSelect: (gif: KlipyGif) => void;
}

/**
 * Two-column masonry of GIFs. Only the tiles near the viewport are mounted, so
 * a long scroll doesn't keep dozens of animated GIFs decoding off-screen.
 */
export default function GifMasonry({ gifs, header, loadingMore, bottomInset, onEndReached, onSelect }: Props) {
    const { width, height: screenHeight } = useWindowDimensions();
    const columnWidth = (width - GRID_PADDING * 2 - GRID_GAP) / 2;

    const [windowTop, setWindowTop] = useState(0);
    const windowTopRef = useRef(0);

    // Each GIF goes to the shorter column. Appending a page never moves the
    // tiles already placed.
    const layout = useMemo(() => {
        const columns = [0, 0];
        const tiles: Tile[] = gifs.map((gif) => {
            const media = gif.media_formats.tinygif ?? gif.media_formats.mediumgif ?? gif.media_formats.gif;
            const [w, h] = media?.dims ?? [1, 1];
            const height = Math.round(Math.min(Math.max((columnWidth * h) / w, columnWidth * 0.55), columnWidth * 1.5));
            const col = columns[0] <= columns[1] ? 0 : 1;
            const tile = { gif, url: media?.url, top: columns[col], left: col * (columnWidth + GRID_GAP), height };
            columns[col] += height + GRID_GAP;
            return tile;
        });
        return { tiles, height: Math.max(0, Math.max(...columns) - GRID_GAP) };
    }, [gifs, columnWidth]);

    const handleScroll = useCallback((e: any) => {
        const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
        const top = Math.floor(contentOffset.y / WINDOW_STEP) * WINDOW_STEP;
        if (top !== windowTopRef.current) {
            windowTopRef.current = top;
            setWindowTop(top);
        }
        if (contentOffset.y + layoutMeasurement.height > contentSize.height - screenHeight * 0.75) {
            onEndReached();
        }
    }, [onEndReached, screenHeight]);

    const minY = windowTop - screenHeight;
    const maxY = windowTop + screenHeight * 2;

    return (
        <BottomSheetScrollView
            onScroll={handleScroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={[styles.gridContent, { paddingBottom: bottomInset }]}
        >
            {header}
            <View style={{ height: layout.height }}>
                {layout.tiles.map((tile) =>
                    tile.top + tile.height > minY && tile.top < maxY ? (
                        <GifTile key={tile.gif.id} tile={tile} width={columnWidth} onSelect={onSelect} />
                    ) : null
                )}
            </View>
            {loadingMore && <ActivityIndicator style={styles.loadingMore} color={getThemeColor('tint')} />}
        </BottomSheetScrollView>
    );
}

const GifTile = memo(function GifTile({ tile, width, onSelect }: { tile: Tile; width: number; onSelect: (gif: KlipyGif) => void }) {
    return (
        <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onSelect(tile.gif)}
            accessibilityRole="button"
            accessibilityLabel={tile.gif.content_description || tile.gif.title || 'GIF'}
            style={[styles.gifTile, { top: tile.top, left: tile.left, width, height: tile.height }]}
        >
            <Image
                source={tile.url ? { uri: tile.url } : undefined}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={120}
                recyclingKey={tile.gif.id}
            />
        </TouchableOpacity>
    );
});
