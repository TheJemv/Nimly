import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
    headerSection: { paddingHorizontal: 20, marginBottom: 24, marginTop: 10 },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
    avatarWrapper: { width: 100, height: 100, borderRadius: 50, borderWidth: 2, overflow: 'hidden', backgroundColor: '#111' },
    statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
    statItem: { alignItems: 'center' },
    statNumber: { fontSize: 16, fontWeight: 'bold', marginTop: 4, color: '#fff' },
    statLabel: { fontSize: 10, opacity: 0.6, color: '#fff' },
    bioSection: { marginTop: 16 },
    bioText: { color: '#8E8E93', fontSize: 15, lineHeight: 22 },
    lockedArea: { padding: 20 },
    lockedCard: { padding: 32, borderRadius: 28, borderWidth: 1, alignItems: 'center', borderStyle: 'dashed' },
    lockedTitle: { fontSize: 18, fontWeight: 'bold', marginVertical: 16, color: '#fff' },
    connectBtn: { width: '100%', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
    btnText: { color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
    feed: { paddingHorizontal: 16, gap: 16, paddingBottom: 60 },
    blockedArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
    blockedTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginTop: 16, textAlign: 'center' },
    blockedSubtitle: { fontSize: 14, color: '#8E8E93', marginTop: 8, textAlign: 'center', lineHeight: 20 },
});