import { getThemeColor } from "@/constants/theme";
import { StyleSheet } from "react-native";

const SURFACE = getThemeColor("surface");

export const styles = StyleSheet.create({
    footerWrapper: { backgroundColor: '#050505', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SURFACE },
    inputArea: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8
    },
    input: {
        flex: 1,
        backgroundColor: SURFACE,
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