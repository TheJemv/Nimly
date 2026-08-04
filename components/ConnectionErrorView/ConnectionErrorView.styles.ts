import { getThemeColor } from "@/constants/theme";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center'
    },
    content: {
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
        textAlign: 'center',
    },
    subtitle: {
        color: '#888',
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 16,
        maxWidth: 290,
    },
    confirmBtn: {
        backgroundColor: getThemeColor('tint'),
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 25,
        width: 240, // Ancho controlado para que se vea simétrico y estilizado
        alignItems: 'center',
        height: 50,
        justifyContent: 'center',
    },
    disabledBtn: {
        opacity: 0.8,
    },
    confirmText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '700',
    },
});