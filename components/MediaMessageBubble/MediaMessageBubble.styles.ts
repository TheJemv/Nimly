import { Dimensions, StyleSheet } from "react-native";
const { width, height } = Dimensions.get('window');

export const styles = StyleSheet.create({
    standardImageContainer: { width: 200, height: 250, borderRadius: 15, overflow: 'hidden', backgroundColor: '#1c1c1e' },
    imageMini: { width: '100%', height: '100%' },
    placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    retryTouch: { justifyContent: 'center', alignItems: 'center' },
    senderVO: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    senderVOText: { color: '#fff', fontSize: 14, opacity: 0.8 },
    receiverVOContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: '#1C1C1E',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#1C1C1E',
    },
    iconCircle: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: 'rgba(255,255,255,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    receiverVOText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500'
    },
    receiverVO: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
    fullScreenContainer: { flex: 1, backgroundColor: '#000' },
    fullScreenImage: { width: width, height: height },
    closeBtn: { position: 'absolute', top: 60, right: 25, zIndex: 99, shadowColor: '#000', shadowRadius: 10, shadowOpacity: 0.5 },
    lockedContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12, minWidth: 150 },
    lockedText: { color: '#fff', fontSize: 16 },
    animatedContainer: {
        flex: 1,
        width: '100%',
        height: '100%',
        justifyContent: 'center', // Centra la imagen verticalmente
        alignItems: 'center',     // Centra la imagen horizontalmente
    },
});