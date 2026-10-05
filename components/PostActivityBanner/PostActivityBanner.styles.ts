import { getThemeColor } from "@/constants/theme";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
    wrap: { position: "absolute", left: 10, right: 10, zIndex: 20, gap: 8 },
    pill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 18,
        borderRadius: 24,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "rgba(22,22,22,0.7)",
    },
    label: { flex: 1, color: getThemeColor("text"), fontSize: 15, fontWeight: "600" },
    retry: { color: getThemeColor("tint"), fontSize: 15, fontWeight: "700" },
});
