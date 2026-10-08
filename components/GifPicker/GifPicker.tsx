import type { KlipyCategory, KlipyGif } from '@/api/klipy/gifs';
import EmptyState from '@/components/EmptyState';
import NymlySheet from '@/components/nymly-sheet';
import { getThemeColor } from '@/constants/theme';
import { BottomSheetFlatList, BottomSheetModal, BottomSheetTextInput, useBottomSheetModal } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import React, { forwardRef, useCallback } from 'react';
import { Keyboard, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { styles } from './GifPicker.styles';
import GifMasonry from './components/GifMasonry';
import { GifGridSkeleton } from './components/GifSkeletons';
import { useGifSearch } from './hooks';

const MUTED = getThemeColor('textSecondary');
const TINT = getThemeColor('tint');
const SNAP_POINTS = ['70%', '100%'];

type CategoryItem = { kind: 'trending' } | { kind: 'category'; category: KlipyCategory };

interface Props {
    onSelect: (gif: KlipyGif) => void;
}

/** Bottom sheet to search KLIPY and pick a GIF: categories first, then results. */
// 'push': opened from the comments sheet, it goes on top of it. With 'switch'
// the comments sheet is minimized and, in this version of the library, never
// comes back after the picker closes.
const GifPicker = forwardRef<BottomSheetModal, Props>(({ onSelect }, ref) => (
    <NymlySheet ref={ref} snapPoints={SNAP_POINTS} stackBehavior="push">
        <GifPickerContent onSelect={onSelect} />
    </NymlySheet>
));

GifPicker.displayName = 'GifPicker';
export default GifPicker;

function GifPickerContent({ onSelect }: Props) {
    const insets = useSafeAreaInsets();
    const { dismiss } = useBottomSheetModal();
    const {
        mode,
        query,
        categories,
        trendingCover,
        homeLoading,
        homeError,
        results,
        loading,
        loadingMore,
        error,
        changeQuery,
        openCategory,
        openTrending,
        goHome,
        loadMore,
        retry,
    } = useGifSearch();

    const bottomInset = insets.bottom + 24;

    const handleBack = useCallback(() => {
        Keyboard.dismiss();
        goHome();
    }, [goHome]);

    const handleSelect = useCallback((gif: KlipyGif) => {
        Keyboard.dismiss();
        onSelect(gif);
        dismiss();
    }, [onSelect, dismiss]);

    const renderCategory = useCallback(({ item }: { item: CategoryItem }) => {
        const isTrending = item.kind === 'trending';
        const image = isTrending ? trendingCover?.media_formats.tinygif?.url : item.category.image;
        const label = isTrending ? 'Trending GIFs' : item.category.searchterm;

        return (
            <TouchableOpacity
                activeOpacity={0.75}
                style={styles.categoryTile}
                onPress={() => (isTrending ? openTrending() : openCategory(item.category.searchterm))}
                accessibilityRole="button"
                accessibilityLabel={label}
            >
                {image ? <Image source={{ uri: image }} style={{ flex: 1 }} contentFit="cover" transition={120} /> : null}
                <View style={styles.categoryOverlay}>
                    {isTrending && <SymbolView name="chart.line.uptrend.xyaxis" size={16} tintColor="#fff" />}
                    <Text style={styles.categoryLabel} numberOfLines={1}>{label}</Text>
                </View>
            </TouchableOpacity>
        );
    }, [trendingCover, openTrending, openCategory]);

    const renderBody = () => {
        if (mode === 'home') {
            if (categories.length === 0) {
                if (homeError) return <ErrorState onRetry={retry} />;
                if (homeLoading) return <GifGridSkeleton variant="categories" bottomInset={bottomInset} />;
            }
            const data: CategoryItem[] = [
                { kind: 'trending' },
                ...categories.map((category) => ({ kind: 'category' as const, category })),
            ];
            return (
                <BottomSheetFlatList
                    data={data}
                    keyExtractor={(item: CategoryItem) => (item.kind === 'trending' ? 'trending' : item.category.searchterm)}
                    renderItem={renderCategory}
                    numColumns={2}
                    columnWrapperStyle={styles.gridRow}
                    ItemSeparatorComponent={GridSeparator}
                    contentContainerStyle={[styles.gridContent, { paddingBottom: bottomInset }]}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                />
            );
        }

        const header = mode === 'trending' ? <Text style={styles.sectionTitle}>Trending GIFs</Text> : null;

        if (error) return <ErrorState onRetry={retry} />;
        if (loading) return <GifGridSkeleton variant="gifs" header={header} bottomInset={bottomInset} />;
        if (results.length === 0) {
            return (
                <EmptyState
                    icon="magnifyingglass"
                    title="No GIFs found"
                    message="Try a different word."
                    style={styles.stateContainer}
                />
            );
        }

        return (
            <GifMasonry
                gifs={results}
                header={header}
                loadingMore={loadingMore}
                bottomInset={bottomInset}
                onEndReached={loadMore}
                onSelect={handleSelect}
            />
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.searchRow}>
                <View style={styles.searchBar}>
                    {mode === 'home' ? (
                        <SymbolView name="magnifyingglass" size={17} tintColor={MUTED} />
                    ) : (
                        <TouchableOpacity onPress={handleBack} hitSlop={10} accessibilityLabel="Back to categories">
                            <SymbolView name="chevron.left" size={17} tintColor="#fff" />
                        </TouchableOpacity>
                    )}
                    <BottomSheetTextInput
                        value={query}
                        onChangeText={changeQuery}
                        placeholder="Search KLIPY"
                        placeholderTextColor="#666"
                        selectionColor={TINT}
                        style={styles.searchInput}
                        returnKeyType="search"
                        autoCorrect={false}
                        autoCapitalize="none"
                    />
                    {query ? (
                        <TouchableOpacity onPress={() => changeQuery('')} hitSlop={10} accessibilityLabel="Clear search">
                            <SymbolView name="xmark.circle.fill" size={17} tintColor={MUTED} />
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>

            {renderBody()}
        </View>
    );
}

function GridSeparator() {
    return <View style={styles.gridSeparator} />;
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
    return (
        <View style={styles.stateContainer}>
            <EmptyState
                icon="wifi.exclamationmark"
                title="Couldn't load GIFs"
                message="Check your connection and try again."
            />
            <TouchableOpacity onPress={onRetry} style={styles.retryButton}>
                <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
        </View>
    );
}
