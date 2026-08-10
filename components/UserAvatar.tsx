import { ESTILOS_DICEBEAR } from "@/constants/dicebear";
import { createAvatar } from "@dicebear/core";
import { useMemo } from "react";
import { Image, StyleSheet, View } from "react-native";
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

    return (
        <View style={[styles.container, dimensionStyle]}>
            <Image
                style={styles.avatarImg}
                source={{
                    uri: "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png",
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        overflow: "hidden",
        backgroundColor: "#1C1C1E",
        justifyContent: "center",
        alignItems: "center",
    },
    avatarImg: {
        width: "100%",
        height: "100%",
    },
});