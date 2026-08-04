import { ESTILOS_DICEBEAR } from "@/constants/dicebear";
import { createAvatar } from "@dicebear/core";
import React, { useMemo } from "react";
import { Image, StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";

interface UserAvatarProps {
    avatar_url?: string | null;
    avatar_config?: any;
    size?: number;
}

export default function UserAvatar({ avatar_url, avatar_config, size = 40 }: UserAvatarProps) {
    const avatarSvg = useMemo(() => {
        if (!avatar_config || !avatar_config.styleId) return null;
        try {
            const estilo =
                ESTILOS_DICEBEAR.find((e) => e.id === avatar_config.styleId) ||
                ESTILOS_DICEBEAR[0];
            return createAvatar(estilo.collection as any, {
                ...avatar_config.options,
                radius: 50,
            }).toString();
        } catch (e) {
            return null;
        }
    }, [avatar_config]);

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
                source={{
                    uri:
                        avatar_url ||
                        "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png",
                }}
                style={styles.avatarImg}
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