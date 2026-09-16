import { ESTILOS_DICEBEAR } from "@/constants/dicebear";
import { getThemeColor } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { createAvatar } from "@dicebear/core";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";

import { useProfile } from "@/context/ProfileContext";

interface UserAvatarProps {
    avatar_url?: string | null;
    avatar_config?: any;
    size?: number;
}

export default function UserAvatar({ avatar_config, size = 40 }: UserAvatarProps) {
    const { profile } = useProfile();
    const finalConfig = avatar_config ?? profile?.avatar_config;

    const avatarSvg = useMemo(() => {
        if (!finalConfig || !finalConfig.styleId) return null;
        try {
            const estilo =
                ESTILOS_DICEBEAR.find((e) => e.id === finalConfig.styleId) ||
                ESTILOS_DICEBEAR[0];
            return createAvatar(estilo.collection as any, {
                ...finalConfig.options,
                radius: 50,
            }).toString();
        } catch {
            return null;
        }
    }, [finalConfig]);

    const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };
    if (avatarSvg) {
        return (
            <View style={[styles.container, dimensionStyle]}>
                <SvgXml xml={avatarSvg} width="100%" height="100%" />
            </View>
        );
    }

    // Local fallback (no external dependencies): neutral icon over the container background.
    return (
        <View style={[styles.container, dimensionStyle]}>
            <Ionicons name="person" size={Math.round(size * 0.55)} color={getThemeColor("icon")} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        overflow: "hidden",
        backgroundColor: getThemeColor("surface"),
        justifyContent: "center",
        alignItems: "center",
    },
});