import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
    outerContainer: { alignItems: 'center', marginVertical: 20 },
    glassContainer: {
        flexDirection: 'row',
        width: 190,
        height: 44,
        borderRadius: 22,
        padding: 4,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
    },
    pill: {
        position: 'absolute',
        top: 4,
        width: 90,
        height: 36,
        borderRadius: 18,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    tabText: { fontSize: 13, fontWeight: '600' }
});