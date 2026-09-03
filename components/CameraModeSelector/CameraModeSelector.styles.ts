import { StyleSheet } from "react-native";

const TRACK_WIDTH = 188;
const TRACK_PADDING = 4;

/** Distance the selection pill slides between the two tabs. */
export const PILL_TRAVEL = (TRACK_WIDTH - TRACK_PADDING * 2) / 2;

export const styles = StyleSheet.create({
    outerContainer: {
        alignItems: 'center',
        marginBottom: 16,
    },
    glassContainer: {
        flexDirection: 'row',
        width: TRACK_WIDTH,
        height: 40,
        borderRadius: 20,
        padding: TRACK_PADDING,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
        overflow: 'hidden',
    },
    pill: {
        position: 'absolute',
        top: TRACK_PADDING,
        left: TRACK_PADDING,
        width: PILL_TRAVEL,
        height: 32,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        zIndex: 2,
    },
    tabText: {
        fontSize: 13,
        fontWeight: '600',
    },
});
