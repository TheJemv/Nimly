import { useVideoPlayer, VideoView, type VideoSource } from "expo-video";
import React, { useEffect } from "react";
import { Modal, StyleSheet } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
   runOnJS,
   useAnimatedStyle,
   useSharedValue,
   withSpring,
   withTiming,
} from "react-native-reanimated";

const DISMISS_THRESHOLD = 120;
const DISMISS_VELOCITY = 800;

type Props = {
   visible: boolean;
   /** String (MP4 del chat) u objeto VideoSource (HLS de posts/stories, con headers). */
   uri: string | VideoSource | null;
   onClose: () => void;
   /** El player reventó (p. ej. HLS caído). El caller puede caer al MP4. */
   onError?: () => void;
};

/**
 * Reproductor de video a pantalla completa con controles nativos.
 * Sin botón de cerrar: se desliza hacia arriba o abajo para salir, como el
 * visor de fotos e Instagram/Fotos.
 */
export default function FullscreenVideoViewer({ visible, uri, onClose, onError }: Props) {
   const player = useVideoPlayer(visible && uri ? uri : null, (p) => {
      p.loop = false;
      p.play();
   });

   const ty = useSharedValue(0);
   const backdropOpacity = useSharedValue(1);

   // Fallback ante error del player (HLS caído / signed URL vencida).
   useEffect(() => {
      if (!visible || !onError) return;
      const check = () => {
         try { if (player.status === 'error') onError(); } catch { /* liberado */ }
      };
      check();
      let sub: { remove: () => void } | undefined;
      try { sub = player.addListener?.('statusChange', check); } catch { /* liberado */ }
      return () => { try { sub?.remove(); } catch { /* liberado */ } };
   }, [visible, player, onError]);

   useEffect(() => {
      if (!visible) return;
      ty.value = 0;
      backdropOpacity.value = 1;
      try {
         player.currentTime = 0;
         player.play();
      } catch { /* player liberado */ }
   }, [visible, player, ty, backdropOpacity]);

   // Solo vertical: si el arrastre es más horizontal (ej. la barra de progreso
   // de los controles nativos), este gesto falla y les deja el toque a ellos.
   const pan = Gesture.Pan()
      .activeOffsetY([-10, 10])
      .failOffsetX([-15, 15])
      .onUpdate((e) => {
         ty.value = e.translationY;
         backdropOpacity.value = Math.max(0.3, 1 - Math.abs(e.translationY) / 400);
      })
      .onEnd((e) => {
         if (Math.abs(e.translationY) > DISMISS_THRESHOLD || Math.abs(e.velocityY) > DISMISS_VELOCITY) {
            runOnJS(onClose)();
            return;
         }
         ty.value = withSpring(0);
         backdropOpacity.value = withTiming(1);
      });

   const videoStyle = useAnimatedStyle(() => ({
      transform: [{ translateY: ty.value }],
   }));
   const backdropStyle = useAnimatedStyle(() => ({
      opacity: backdropOpacity.value,
   }));

   return (
      <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
         <GestureHandlerRootView style={styles.root}>
            <Animated.View style={[styles.backdrop, backdropStyle]} />
            <GestureDetector gesture={pan}>
               <Animated.View style={[styles.fill, videoStyle]}>
                  <VideoView
                     player={player}
                     style={styles.video}
                     contentFit="contain"
                     nativeControls
                  />
               </Animated.View>
            </GestureDetector>
         </GestureHandlerRootView>
      </Modal>
   );
}

const styles = StyleSheet.create({
   root: { flex: 1, backgroundColor: "transparent" },
   backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#000" },
   fill: { flex: 1 },
   video: { flex: 1, backgroundColor: "transparent" },
});
