import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
    outerContainer: {
        alignItems: 'center',
        marginBottom: 16,
    },
    glassContainer: {
        flexDirection: 'row',
        width: 190,
        height: 40,
        borderRadius: 20,
        padding: 4,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
        overflow: 'hidden',
    },
    pill: {
        position: 'absolute',
        top: 4,
        width: 90,
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