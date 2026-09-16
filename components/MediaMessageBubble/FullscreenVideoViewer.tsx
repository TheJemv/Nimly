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
   /** String (chat MP4) or VideoSource object (HLS for posts/stories, with headers). */
   uri: string | VideoSource | null;
   onClose: () => void;
   /** The player crashed (e.g. HLS down). The caller can fall back to MP4. */
   onError?: () => void;
};

/**
 * Fullscreen video player with native controls.
 * No close button: swipe up or down to exit, like the photo viewer and
 * Instagram/Photos.
 */
export default function FullscreenVideoViewer({ visible, uri, onClose, onError }: Props) {
   const player = useVideoPlayer(visible && uri ? uri : null, (p) => {
      p.loop = false;
      p.play();
   });

   const ty = useSharedValue(0);
   const backdropOpacity = useSharedValue(1);

   // Fallback for player errors (HLS down / expired signed URL).
   useEffect(() => {
      if (!visible || !onError) return;
      const check = () => {
         try { if (player.status === 'error') onError(); } catch { /* released */ }
      };
      check();
      let sub: { remove: () => void } | undefined;
      try { sub = player.addListener?.('statusChange', check); } catch { /* released */ }
      return () => { try { sub?.remove(); } catch { /* released */ } };
   }, [visible, player, onError]);

   useEffect(() => {
      if (!visible) return;
      ty.value = 0;
      backdropOpacity.value = 1;
      try {
         player.currentTime = 0;
         player.play();
      } catch { /* player released */ }
   }, [visible, player, ty, backdropOpacity]);

   // Vertical only: if the drag is more horizontal (e.g. the native controls'
   // progress bar), this gesture fails and lets them handle the touch.
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
