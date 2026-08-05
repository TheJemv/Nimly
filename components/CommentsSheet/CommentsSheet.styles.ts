import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
    sheetContainer: { flex: 1, backgroundColor: '#050505' },
    headerContainer: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1C1C1E' },
    sheetTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', textAlign: 'center', paddingVertical: 14 },
    listContent: { paddingHorizontal: 16, paddingTop: 16 },
    commentRow: { flexDirection: 'row', marginBottom: 20 },
    avatarContainer: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', marginRight: 12 },
    commentContent: { flex: 1 },
    username: { color: '#FFF', fontSize: 14, fontWeight: '600', marginBottom: 2 },
    commentText: { color: '#EBEBF5', fontSize: 15, lineHeight: 20 },
});