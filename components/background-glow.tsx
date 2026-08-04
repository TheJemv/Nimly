import { Image, StyleSheet } from "react-native";

export default function BackgroundGlow() {
    return (
        <Image source={require("@/assets/images/bg-glow-teal.png")} style={styles.bgGlow} />
    )
}

const styles = StyleSheet.create({
    bgGlow: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.2
    },
}) 