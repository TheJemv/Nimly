import { getThemeColor } from "@/constants/theme";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    closeBtn: { position: 'absolute', top: 50, left: 20, zIndex: 10 },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
        gap: 12,
    },
    iconCircle: {
        width: 84,
        height: 84,
        borderRadius: 42,
        backgroundColor: 'rgba(255,255,255,0.06)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    title: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '700',
    },
    subtitle: {
        color: '#888',
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 16,
        maxWidth: 280,
    },
    confirmBtn: {
        backgroundColor: getThemeColor('tint'),
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 25,
        width: '100%',
        alignItems: 'center',
    },
    confirmText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '700',
    },
    skipBtn: {
        paddingVertical: 12,
    },
    skipText: {
        color: '#666',
        fontSize: 14,
        fontWeight: '500',
    },
});