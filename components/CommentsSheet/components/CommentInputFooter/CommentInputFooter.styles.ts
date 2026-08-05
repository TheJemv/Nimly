import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
    footerWrapper: { backgroundColor: '#050505', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#1C1C1E' },
    inputArea: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8
    },
    input: {
        flex: 1,
        backgroundColor: '#1C1C1E',
        borderRadius: 99,
        paddingHorizontal: 16,
        paddingVertical: 12,
        color: "#fff"
    },
    sendBtn: {
        height: 44,
        width: 44,
        justifyContent: 'center',
        alignItems: 'center',
    }
});