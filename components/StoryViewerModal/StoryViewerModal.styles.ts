import { Colors } from "@/constants/theme";
import { Dimensions, StyleSheet } from "react-native";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

/** Rounded bottom corners of the story media, matching Instagram. */
const STORY_CARD_RADIUS = 24;

export const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.dark.background,
    },
    loaderContainer: {
        ...StyleSheet.absoluteFill,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 2,
    },
    // Media lives in a rounded card that starts below the status bar and stops
    // above the reply dock. `top` / `bottom` are set inline from the safe-area
    // insets.
    mediaCard: {
        position: "absolute",
        left: 0,
        right: 0,
        overflow: "hidden",
        backgroundColor: "#000",
        borderRadius: STORY_CARD_RADIUS,
    },
    storyMedia: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    uiOverlay: {
        ...StyleSheet.absoluteFill,
        zIndex: 10,
        justifyContent: "space-between",
        pointerEvents: "box-none",
    },
    topSection: { width: "100%" },
    hiddenUI: { opacity: 0 },
    progressContainer: {
        flexDirection: "row",
        paddingHorizontal: 12,
        gap: 4,
    },
    progressBarBackground: {
        flex: 1,
        height: 3,
        backgroundColor: "rgba(255, 255, 255, 0.35)",
        borderRadius: 2,
        overflow: "hidden",
    },
    progressBarFill: {
        height: "100%",
        backgroundColor: Colors.dark.text,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        marginTop: 10,
    },
    userInfo: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    headerAvatarContainer: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1.5,
        borderColor: Colors.dark.tint,
        backgroundColor: Colors.dark.surface,
        overflow: "hidden",

        display: "flex",
        justifyContent: "center",
        alignItems: "center"
    },
    avatarImg: { width: "100%", height: "100%" },
    headerUsername: {
        color: Colors.dark.text,
        fontWeight: "bold",
        fontSize: 14,
        textShadowColor: "rgba(0,0,0,0.8)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        alignItems: "center",
        justifyContent: "center",
    },
    closeText: {
        color: Colors.dark.text,
        fontSize: 16,
        fontWeight: "bold",
    },
    touchOverlay: {
        ...StyleSheet.absoluteFill,
        flexDirection: "row",
        zIndex: 5,
    },
    touchLeft: { width: "30%", height: "100%" },
    touchRight: { width: "70%", height: "100%" },
    // Bottom dock: pinned to the screen bottom, lifts with the keyboard.
    footerDock: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
    },
    footer: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 10,
    },
    actionsContainer: { alignItems: "center", display: "flex", flexDirection: "row", gap: 12, minHeight: 46 },
    // Thin wrapper so `keyboardShouldPersistTaps` works (a plain View can't do it,
    // and `scrollEnabled={false}` disables persistTaps). Fixed height keeps it
    // laying out like the row it wraps; it never actually scrolls.
    replyRowScroll: { flexGrow: 0, height: 50 },
    likeButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "rgba(0,0,0,0.55)",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.16)",
        flexDirection: "row",
        gap: 4,
    },
    viewsBadge: {
        color: "#FFF",
        fontSize: 11,
        fontWeight: "bold",
    },
    backdrop: {
        ...StyleSheet.absoluteFill,
        backgroundColor: "rgba(0,0,0,0.6)",
        zIndex: 20,
    },
    sheetContainer: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: SCREEN_HEIGHT * 0.55,
        backgroundColor: "#121212",
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        zIndex: 30,
        paddingTop: 12,
        borderTopWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
    },
    sheetHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: "rgba(255,255,255,0.3)",
        alignSelf: "center",
        marginBottom: 12,
    },
    sheetHeader: {
        paddingHorizontal: 20,
        paddingBottom: 15,
        borderBottomWidth: 0.5,
        borderBottomColor: "rgba(255,255,255,0.1)",
    },
    sheetTitle: { color: "#FFF", fontSize: 18, fontWeight: "700" },
    sheetSubTitle: { color: "#8E8E93", fontSize: 12, marginTop: 2 },
    listContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 },
    viewerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 12,
    },
    viewerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    viewerAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        overflow: "hidden",
        backgroundColor: "#2C2C2E",
    },
    viewerUsername: { color: "#FFF", fontSize: 15, fontWeight: "600" },
    emptyContainer: { alignItems: "center", marginTop: 40, gap: 8 },
    emptyText: { color: "#8E8E93", fontSize: 14 },
    userTextContainer: {
        flexDirection: "column",
    },
    timeAgoText: {
        color: "rgba(255, 255, 255, 0.7)",
        fontSize: 11,
        fontWeight: "400",
        textShadowColor: "rgba(0,0,0,0.8)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    myActions: {
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between"
    },
    textInputReply: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.55)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.16)",
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 22,
        color: "#ffffff"
    },

    actionsTop: {
        display: "flex",
        flexDirection: "row",
        gap: 8
    }
});