import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    avatarPlaceholder: { width: 56, height: 56, backgroundColor: '#111' },


    lastMessageRead: { color: '#666666' },
    lastMessageMine: { color: '#888888' },
    lastMessageUnread: { color: '#E5E5EA', fontWeight: '600' },

    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    empty: { alignItems: 'center', marginTop: 100 },
    emptyText: { color: '#444', fontSize: 15 },
});