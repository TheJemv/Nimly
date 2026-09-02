import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import React, { useEffect } from "react";
import { Dimensions, Modal, StyleSheet, TouchableOpacity } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
   runOnJS,
   useAnimatedStyle,
   useSharedValue,
   withSpring,
   withTiming,
} from "react-native-reanimated";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DISMISS_THRESHOLD = 120;

type Props = {
   visible: boolean;
   uri: string | null;
   onClose: () => void;
};

/**
 * Visor de imagen a pantalla completa con:
 *  - Pellizco (dos dedos) para hacer zoom, con doble‑tap para acercar/alejar.
 *  - Arrastre para desplazar la imagen cuando está ampliada.
 *  - Deslizar hacia abajo/arriba para cerrar cuando está en 1x.
 *
 * Todo se maneja con Reanimated en el hilo de UI (sin mezclar drivers como el
 * `PanResponder` anterior) y el estado se reinicia cada vez que se abre.
 */
export default function FullscreenImageViewer({ visible, uri, onClose }: Props) {
   const scale = useSharedValue(1);
   const savedScale = useSharedValue(1);
   const tx = useSharedValue(0);
   const ty = useSharedValue(0);
   const savedTx = useSharedValue(0);
   const savedTy = useSharedValue(0);

   // Reinicia la transformación cada vez que el visor se vuelve a abrir.
   useEffect(() => {
      if (!visible) return;
      scale.value = 1;
      savedScale.value = 1;
      tx.value = 0;
      ty.value = 0;
      savedTx.value = 0;
      savedTy.value = 0;
   }, [visible, scale, savedScale, tx, ty, savedTx, savedTy]);

   const pinch = Gesture.Pinch()
      .onUpdate((e) => {
         scale.value = Math.min(MAX_SCALE, Math.max(0.85, savedScale.value * e.scale));
      })
      .onEnd(() => {
         if (scale.value <= 1) {
            scale.value = withTiming(1);
            savedScale.value = 1;
            tx.value = withTiming(0);
            ty.value = withTiming(0);
            savedTx.value = 0;
            savedTy.value = 0;
            return;
         }
         savedScale.value = scale.value;
         const maxX = (SCREEN_W * scale.value - SCREEN_W) / 2;
         const maxY = (SCREEN_H * scale.value - SCREEN_H) / 2;
         tx.value = Math.min(maxX, Math.max(-maxX, tx.value));
         ty.value = Math.min(maxY, Math.max(-maxY, ty.value));
         savedTx.value = tx.value;
         savedTy.value = ty.value;
      });

   const pan = Gesture.Pan()
      .averageTouches(true)
      .onUpdate((e) => {
         if (scale.value > 1) {
            tx.value = savedTx.value + e.translationX;
            ty.value = savedTy.value + e.translationY;
         } else {
            tx.value = e.translationX * 0.35;
            ty.value = e.translationY;
         }
      })
      .onEnd((e) => {
         if (scale.value > 1) {
            const maxX = (SCREEN_W * scale.value - SCREEN_W) / 2;
            const maxY = (SCREEN_H * scale.value - SCREEN_H) / 2;
            tx.value = withSpring(Math.min(maxX, Math.max(-maxX, tx.value)), { damping: 20 });
            ty.value = withSpring(Math.min(maxY, Math.max(-maxY, ty.value)), { damping: 20 });
            savedTx.value = tx.value;
            savedTy.value = ty.value;
            return;
         }
         if (Math.abs(e.translationY) > DISMISS_THRESHOLD) {
            runOnJS(onClose)();
            return;
         }
         tx.value = withSpring(0);
         ty.value = withSpring(0);
      });

   const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(260)
      .onEnd(() => {
         if (scale.value > 1) {
            scale.value = withTiming(1);
            savedScale.value = 1;
            tx.value = withTiming(0);
            ty.value = withTiming(0);
            savedTx.value = 0;
            savedTy.value = 0;
         } else {
            scale.value = withTiming(DOUBLE_TAP_SCALE);
            savedScale.value = DOUBLE_TAP_SCALE;
         }
      });

   const composed = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

   const imageStyle = useAnimatedStyle(() => ({
      transform: [
         { translateX: tx.value },
         { translateY: ty.value },
         { scale: scale.value },
      ],
   }));

   const backdropStyle = useAnimatedStyle(() => {
      const drag = scale.value <= 1 ? Math.abs(ty.value) : 0;
      return { opacity: Math.max(0.3, 1 - drag / 450) };
   });

   return (
      <Modal
         visible={visible}
         transparent
         animationType="fade"
         statusBarTranslucent
         onRequestClose={onClose}
      >
         <GestureHandlerRootView style={styles.root}>
            <Animated.View style={[styles.backdrop, backdropStyle]} />

            <GestureDetector gesture={composed}>
               <Animated.View style={styles.fill}>
                  {uri ? (
                     <Animated.View style={imageStyle}>
                        <Image
                           source={{ uri }}
                           style={styles.image}
                           contentFit="contain"
                           transition={100}
                        />
                     </Animated.View>
                  ) : null}
               </Animated.View>
            </GestureDetector>

            <TouchableOpacity
               style={styles.closeBtn}
               onPress={onClose}
               hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
               <SymbolView name="xmark.circle.fill" size={30} tintColor="#fff" />
            </TouchableOpacity>
         </GestureHandlerRootView>
      </Modal>
   );
}

const styles = StyleSheet.create({
   root: { flex: 1, backgroundColor: "transparent" },
   backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#000" },
   fill: { flex: 1, alignItems: "center", justifyContent: "center" },
   image: { width: SCREEN_W, height: SCREEN_H },
   closeBtn: {
      position: "absolute",
      top: 54,
      right: 22,
      zIndex: 10,
      shadowColor: "#000",
      shadowRadius: 10,
      shadowOpacity: 0.5,
   },
});
