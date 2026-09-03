import { SymbolView } from "expo-symbols";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect } from "react";
import { Modal, StyleSheet, TouchableOpacity } from "react-native";

type Props = {
   visible: boolean;
   uri: string | null;
   onClose: () => void;
};

/** Reproductor de video a pantalla completa con controles nativos. */
export default function FullscreenVideoViewer({ visible, uri, onClose }: Props) {
   const player = useVideoPlayer(visible && uri ? uri : null, (p) => {
      p.loop = false;
      p.play();
   });

   useEffect(() => {
      if (!visible) return;
      try {
         player.currentTime = 0;
         player.play();
      } catch { /* player liberado */ }
   }, [visible, player]);

   return (
      <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
         <VideoView
            player={player}
            style={styles.video}
            contentFit="contain"
            nativeControls
         />
         <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <SymbolView name="xmark.circle.fill" size={30} tintColor="#fff" />
         </TouchableOpacity>
      </Modal>
   );
}

const styles = StyleSheet.create({
   video: { flex: 1, backgroundColor: "#000" },
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
