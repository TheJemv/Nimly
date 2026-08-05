import { Colors } from "@/constants/theme";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
    lastMessageUnread: {
        fontSize: 14,
        fontWeight: "600",
        color: Colors.dark.text,
    },
    lastMessageMine: {
        fontSize: 14,
        color: Colors.dark.textSecondary,
    },
    lastMessageRead: {
        fontSize: 14,
        color: Colors.dark.textSecondary,
    },
});