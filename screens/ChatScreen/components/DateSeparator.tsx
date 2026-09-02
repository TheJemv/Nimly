import React from "react";
import { StyleSheet, Text, View } from "react-native";

/** Separador central discreto (estilo Instagram) entre grupos de mensajes. */
export const DateSeparator = React.memo(({ label }: { label: string }) => (
   <View style={styles.wrap}>
      <Text style={styles.text}>{label}</Text>
   </View>
));

DateSeparator.displayName = "DateSeparator";

const styles = StyleSheet.create({
   wrap: {
      alignSelf: "center",
      marginTop: 6,
      marginBottom: 14,
   },
   text: {
      color: "#8E8E93",
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 0.2,
      textAlign: "center",
   },
});
