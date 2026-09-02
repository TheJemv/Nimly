import { SymbolView } from "expo-symbols";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

/**
 * Discreet in-thread system line (same muted styling as the time separators).
 * Used to explain why a stretch of messages is missing, e.g. a key change.
 */
export const ChatSystemNotice = React.memo(({ text }: { text: string }) => (
   <View style={styles.wrap}>
      <View style={styles.pill}>
         <SymbolView name="key.slash.fill" size={11} tintColor="#8E8E93" />
         <Text style={styles.text}>{text}</Text>
      </View>
   </View>
));

ChatSystemNotice.displayName = "ChatSystemNotice";

const styles = StyleSheet.create({
   wrap: { alignSelf: "center", alignItems: "center", marginVertical: 12, paddingHorizontal: 20 },
   pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      maxWidth: "100%",
      backgroundColor: "rgba(255,255,255,0.06)",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
   },
   text: {
      color: "#8E8E93",
      fontSize: 11.5,
      fontWeight: "500",
      textAlign: "center",
      flexShrink: 1,
   },
});
