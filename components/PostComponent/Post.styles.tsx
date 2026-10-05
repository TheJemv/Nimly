import { getThemeColor } from "@/constants/theme";
import { StyleSheet } from "react-native";

const SURFACE = getThemeColor("surface");
const TEXT_SECONDARY = getThemeColor("textSecondary");
const TEXT = getThemeColor("text");

// Header, actions and captions sit 20pt from the screen edge; media and the
// text panel sit 10pt. That step is what makes the media read as inset.
const CONTENT_INSET = 20;
const MEDIA_INSET = 10;
const MEDIA_RADIUS = 28;

export const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: CONTENT_INSET,
        paddingTop: 18,
        paddingBottom: 14,
    },
    userInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
    avatarWrap: {
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: SURFACE,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    nameColumn: { flexShrink: 1, gap: 1 },
    usernameText: { color: TEXT, fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },
    dateText: { color: TEXT_SECONDARY, fontSize: 15 },
    moreButton: { paddingLeft: 12, paddingVertical: 8 },

    caption: { paddingHorizontal: CONTENT_INSET, paddingBottom: 14 },
    captionText: { color: TEXT, fontSize: 16, lineHeight: 23, letterSpacing: -0.1 },

    mediaFrame: {
        marginHorizontal: MEDIA_INSET,
        aspectRatio: 8 / 9,
        borderRadius: MEDIA_RADIUS,
        backgroundColor: SURFACE,
        overflow: 'hidden',
    },
    image: { width: '100%', height: '100%' },
    posterOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    playOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
    muteButton: {
        position: 'absolute',
        right: 14,
        bottom: 14,
        width: 36,
        height: 36,
        borderRadius: 18,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.35)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    muteBlur: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
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

    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 22,
        paddingHorizontal: CONTENT_INSET,
        paddingTop: 18,
        paddingBottom: 22,
    },
    actionButton: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    actionText: { color: TEXT, fontSize: 16, fontWeight: '500' },
    // 1pt (not hairlineWidth: at 0.33pt it vanishes on-device) — the same
    // discreet separator, inset to line up with the header and actions.
    divider: {
        height: 1,
        marginHorizontal: CONTENT_INSET,
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
});
