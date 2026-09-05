import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
    cardContainer: { marginBottom: 20, paddingHorizontal: 4 },
    mainCard: { backgroundColor: '#050505', borderRadius: 28, borderWidth: 1, borderColor: '#1C1C1E', overflow: 'hidden' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
    userInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatarBorder: { width: 44, height: 44, borderRadius: 22, padding: 1.5, backgroundColor: '#1C1C1E' },
    avatarInner: { flex: 1, borderRadius: 21, backgroundColor: '#000', overflow: 'hidden', display: "flex", justifyContent: "center", alignItems: "center" },
    avatarPlaceholder: { flex: 1, backgroundColor: '#1C1C1E' },
    usernameText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', letterSpacing: -0.4 },
    dateText: { color: '#636366', fontSize: 12, marginTop: 1 },
    moreAction: { padding: 4 },
    textFrame: { paddingHorizontal: 12, paddingBottom: 12 },
    bodyText: { color: '#EBEBF5', fontSize: 17, lineHeight: 25, letterSpacing: -0.2 },
    mediaFrame: { width: '100%', aspectRatio: 1, backgroundColor: '#000' },
    image: { width: '100%', height: '100%' },
    heartBurst: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.4,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 0 },
    },
    footer: { flexDirection: 'row', padding: 12, gap: 8, borderTopWidth: 0.5, borderTopColor: '#1C1C1E' },
    interactionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    activeBtn: { backgroundColor: 'rgba(255,255,255,0.03)' },
    interactionText: { color: '#636366', fontSize: 14, fontWeight: '600' },
    contentContainer: {
        gap: 8, // Espacio entre el texto y la imagen si ambos existen
    },
});