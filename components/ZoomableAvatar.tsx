import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useCallback, useState } from "react";
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeIn, FadeOut, runOnJS, ZoomIn, ZoomOut } from "react-native-reanimated";

import UserAvatar from "@/components/UserAvatar";

interface ZoomableAvatarProps {
    avatar_url?: string | null;
    avatar_config?: any;
    size?: number;
    /** Se ejecuta con un toque simple (long‑press siempre abre el visor). */
    onPress?: () => void;
    /** Desactiva el long‑press para ampliar. */
    zoomDisabled?: boolean;
}

/**
 * Avatar que se puede "espiar" al estilo Instagram: al dejar presionado se abre
 * un visor a pantalla completa con el avatar ampliado y blur detrás, sin botones.
 * Se cierra al tocar en cualquier parte.
 */
export default function ZoomableAvatar({
    avatar_url,
    avatar_config,
    size = 40,
    onPress,
    zoomDisabled,
}: ZoomableAvatarProps) {
    const [open, setOpen] = useState(false);
    const { width } = useWindowDimensions();
    const bigSize = Math.min(width * 0.82, 340);

    const openViewer = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
        setOpen(true);
    }, []);

    const closeViewer = useCallback(() => setOpen(false), []);

    const longPress = Gesture.LongPress()
        .minDuration(220)
        .maxDistance(40)
        .onStart(() => {
            runOnJS(openViewer)();
        });

    const tap = Gesture.Tap().onEnd((_e, success) => {
        if (success && onPress) runOnJS(onPress)();
    });

    const gesture = zoomDisabled
        ? tap
        : Gesture.Exclusive(longPress, tap);

    return (
        <>
            <GestureDetector gesture={gesture}>
                <View>
                    <UserAvatar avatar_url={avatar_url} avatar_config={avatar_config} size={size} />
                </View>
            </GestureDetector>

            <Modal
                visible={open}
                transparent
                animationType="none"
                statusBarTranslucent
                onRequestClose={closeViewer}
            >
                <Pressable style={StyleSheet.absoluteFill} onPress={closeViewer}>
                    <Animated.View
                        entering={FadeIn.duration(160)}
                        exiting={FadeOut.duration(160)}
                        style={StyleSheet.absoluteFill}
                    >
                        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
                    </Animated.View>

                    <View style={styles.center} pointerEvents="none">
                        <Animated.View
                            entering={ZoomIn.springify().damping(18).mass(0.6)}
                            exiting={ZoomOut.duration(140)}
                            style={styles.shadow}
                        >
                            <UserAvatar
                                avatar_url={avatar_url}
                                avatar_config={avatar_config}
                                size={bigSize}
                            />
                        </Animated.View>
                    </View>
                </Pressable>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    center: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
    },
    shadow: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.45,
        shadowRadius: 24,
    },
});
