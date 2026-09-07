import { getThemeColor } from "@/constants/theme";
import { StyleSheet } from "react-native";

const textSecondary = getThemeColor("textSecondary");
const border = getThemeColor("border");

export const styles = StyleSheet.create({
    avatarWrapper: { width: 56, height: 56, borderRadius: 28, overflow: 'hidden', backgroundColor: '#111', display: "flex", justifyContent: "center", alignItems: "center" },

    chatCard: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center' },
    chatInfo: { flex: 1, marginLeft: 14, borderBottomWidth: 0.2, borderBottomColor: border, paddingBottom: 12 },
    chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },

    username: { fontSize: 16 },
    usernameRead: { fontWeight: '600', color: textSecondary },
    usernameUnread: { fontWeight: '700', color: '#FFFFFF' },

    timeWrapper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    timeText: { fontSize: 13, color: textSecondary },

    lastMessage: { fontSize: 14, lineHeight: 18, flex: 1 },
    chatBodyRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8
    },
});