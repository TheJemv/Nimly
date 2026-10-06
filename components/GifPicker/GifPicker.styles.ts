import { getThemeColor } from "@/constants/theme";
import { StyleSheet } from "react-native";

const SURFACE = getThemeColor("surface");
const BORDER = getThemeColor("border");
const TINT = getThemeColor("tint");

// Shared by the category grid, the masonry layout and their skeletons.
export const GRID_GAP = 8;
export const GRID_PADDING = 12;
export const CATEGORY_HEIGHT = 96;

export const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#050505' },
    searchRow: {
        paddingHorizontal: GRID_PADDING,
        paddingBottom: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: BORDER,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 40,
        borderRadius: 12,
        paddingHorizontal: 12,
        gap: 8,
        backgroundColor: SURFACE,
    },
    searchInput: { flex: 1, color: '#fff', fontSize: 16, paddingVertical: 0 },
    gridContent: { paddingHorizontal: GRID_PADDING, paddingTop: 12 },
    gridRow: { gap: GRID_GAP },
    gridSeparator: { height: GRID_GAP },

    categoryTile: {
        flex: 1,
        height: CATEGORY_HEIGHT,
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: SURFACE,
    },
    categoryOverlay: {
        ...StyleSheet.absoluteFill,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: 8,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    categoryLabel: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
        textShadowColor: 'rgba(0,0,0,0.6)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 6,
    },

    sectionTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 10 },
    gifTile: { position: 'absolute', borderRadius: 10, overflow: 'hidden', backgroundColor: SURFACE },
    skeletonColumns: { flexDirection: 'row', gap: GRID_GAP },
    skeletonColumn: { flex: 1, gap: GRID_GAP },
    skeletonTile: { borderRadius: 10, backgroundColor: SURFACE },
    loadingMore: { marginVertical: 16 },

    stateContainer: { paddingTop: 48, alignItems: 'center' },
    retryButton: { marginTop: 16, paddingHorizontal: 18, paddingVertical: 8 },
    retryText: { color: TINT, fontSize: 15, fontWeight: '600' },
});
