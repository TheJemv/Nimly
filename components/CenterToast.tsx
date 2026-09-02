import { SymbolView } from "expo-symbols";
import { memo, useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

interface CenterToastProps {
   /** Message to show. */
   message: string;
   /** Bump this number (0 = idle) every time you want the toast to play. */
   trigger: number;
   /** Optional icon shown before the text. */
   icon?: string;
}

/**
 * Tiny centered confirmation that fades in, holds ~1.4s and fades away.
 * Non-interactive: never blocks touches underneath it.
 */
export const CenterToast = memo(({ message, trigger, icon = "checkmark.circle.fill" }: CenterToastProps) => {
   const opacity = useRef(new Animated.Value(0)).current;
   const scale = useRef(new Animated.Value(0.92)).current;

   useEffect(() => {
      if (!trigger) return;

      opacity.stopAnimation();
      scale.stopAnimation();
      opacity.setValue(0);
      scale.setValue(0.92);

      Animated.parallel([
         Animated.timing(opacity, {
            toValue: 1,
            duration: 160,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
         }),
         Animated.spring(scale, {
            toValue: 1,
            friction: 7,
            tension: 90,
            useNativeDriver: true,
         }),
      ]).start(() => {
         Animated.timing(opacity, {
            toValue: 0,
            duration: 550,
            delay: 1400,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
         }).start();
      });
   }, [trigger, opacity, scale]);

   if (!trigger) return null;

   return (
      <View pointerEvents="none" style={styles.wrap}>
         <Animated.View style={[styles.pill, { opacity, transform: [{ scale }] }]}>
            {icon ? <SymbolView name={icon as any} size={16} tintColor="#fff" /> : null}
            <Text style={styles.text}>{message}</Text>
         </Animated.View>
      </View>
   );
});

CenterToast.displayName = "CenterToast";

const styles = StyleSheet.create({
   wrap: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 50,
   },
   pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 20,
      paddingVertical: 13,
      borderRadius: 16,
      backgroundColor: "rgba(0,0,0,0.8)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255,255,255,0.14)",
   },
   text: {
      color: "#fff",
      fontSize: 15,
      fontWeight: "600",
      letterSpacing: 0.2,
   },
});
