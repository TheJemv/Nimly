import { getThemeColor } from "@/constants/theme";
import { StyleSheet } from "react-native";

const TEXT_SECONDARY = getThemeColor("textSecondary");
const TEXT = getThemeColor("text");
const ICON = getThemeColor("icon");

export const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    avatarPlaceholder: { width: 56, height: 56, backgroundColor: '#111' },


    lastMessageRead: { color: TEXT_SECONDARY },
    lastMessageMine: { color: TEXT_SECONDARY },
    lastMessageUnread: { color: TEXT, fontWeight: '600' },

    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    empty: { alignItems: 'center', marginTop: 100 },
    emptyText: { color: ICON, fontSize: 15 },
});