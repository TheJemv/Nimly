import { getThemeColor } from "@/constants/theme";
import { Platform, StyleSheet } from "react-native";

export const styles = StyleSheet.create({
   container: { flex: 1, backgroundColor: "#000" },
   center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
   headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 10 },
   headerAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#111', overflow: 'hidden' },
   headerName: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
   headerSub: { color: '#666', fontSize: 10 },
   rowContainer: { width: '100%', marginBottom: 14, position: 'relative' },
   bubble: { maxWidth: '80%', padding: 12, borderRadius: 20 },
   bubbleImage: { maxWidth: '80%', padding: 0, borderRadius: 20 },
   myBubble: { alignSelf: 'flex-end', backgroundColor: getThemeColor("tint") },
   theirBubble: { alignSelf: 'flex-start', backgroundColor: '#1C1C1E' },
   readReceiptContainer: {
      position: 'absolute',
      right: 0,
      bottom: -12,
      width: 16,
      height: 16,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: '#000',
   },
   inputBar: {
      flexDirection: 'row',
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: Platform.OS === 'ios' ? 35 : 15,
      alignItems: 'center',
      backgroundColor: '#000',
      borderTopWidth: 0.5,
      borderTopColor: '#222',
      gap: 8
   },
   plusHost: { width: 44, height: 44, marginBottom: 2 },
   plusButton: {
      width: 44, height: 44, borderRadius: 22,
      justifyContent: "center", alignItems: "center",
      overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)'
   },
   input: {
      flex: 1, backgroundColor: '#1C1C1E', borderRadius: 20,
      color: "#fff", padding: 12, paddingHorizontal: 16
   },
   sendButton: { height: 44, width: 44, justifyContent: 'center', alignItems: 'center' },
   uploadIndicator: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingVertical: 5, backgroundColor: '#111', gap: 8
   },
   uploadText: { color: '#fff', fontSize: 12, fontWeight: '600' },
   replyPreviewBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: '#111',
      borderTopWidth: 0.5,
      borderTopColor: '#222',
   },
   replyPreviewContent: { flex: 1, marginRight: 8 },
   replyPreviewLabel: { color: '#DC143C', fontSize: 12, fontWeight: '600', marginBottom: 2 },
   keyChangeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: 'rgba(230, 184, 0, 0.12)',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'rgba(230, 184, 0, 0.3)',
   },
   keyChangeText: { color: '#E6B800', fontSize: 12, lineHeight: 16, flex: 1 },
   openedCapsule: { flexDirection: 'row', alignItems: 'center' },
   openedCapsuleText: { color: '#888', fontStyle: 'italic', marginLeft: 8, fontSize: 14 },
});