import { Colors } from "@/constants/theme";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
    container: {
        backgroundColor: "transparent",
        paddingVertical: 12,
        borderBottomWidth: 0,
        borderBottomColor: Colors.dark.glassBorder,
        minHeight: 110,
    },
    scrollContent: { paddingHorizontal: 16, gap: 14 },
    storyCard: { alignItems: "center", width: 64 },
    avatarRing: { padding: 2, borderRadius: 999, borderWidth: 2 },
    avatarInner: {
        width: 56,
        height: 56,
        borderRadius: 28,
        overflow: "hidden",
        backgroundColor: Colors.dark.surface,
    },
    ringUnseen: { borderColor: Colors.dark.tint },
    ringSeen: { borderColor: Colors.dark.icon },
    ringUser: { borderColor: Colors.dark.textSecondary, borderStyle: "dashed" },
    avatar: {
        width: "100%",
        height: "100%",
    },
    addButton: {
        position: "absolute",
        bottom: 0,
        right: 0,
        backgroundColor: Colors.dark.tint,
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: Colors.dark.background,
        zIndex: 10,
    },
    addIcon: { color: Colors.dark.text, fontWeight: "bold", fontSize: 13 },
    usernameText: {
        color: Colors.dark.textSecondary,
        fontSize: 12,
        marginTop: 6,
        textAlign: "center",
    },
});