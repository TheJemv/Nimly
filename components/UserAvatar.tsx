import { ESTILOS_DICEBEAR } from "@/constants/dicebear";
import { createAvatar } from "@dicebear/core";
import { Image } from "expo-image";
import { useMemo } from "react";
import { SvgXml } from "react-native-svg";

export function UserAvatar({
    avatar_url,
    avatar_config,
}: {
    avatar_url: string | null;
    avatar_config?: any;
}) {
    const avatarSvg = useMemo(() => {
        if (!avatar_config || !avatar_config.styleId) return null;
        try {
            const estilo =
                ESTILOS_DICEBEAR.find((e) => e.id === avatar_config.styleId) ||
                ESTILOS_DICEBEAR[0];
            return createAvatar(estilo.collection, {
                ...avatar_config.options,
                radius: 50,
            }).toString();
        } catch (e) {
            return null;
        }
    }, [avatar_config]);

    if (avatarSvg) {
        return <SvgXml xml={avatarSvg} width="100%" height="100%" />;
    }

    return (
        <Image
            source={{
                uri:
                    avatar_url ||
                    "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png",
            }}
            style={styles.avatarImg}
        />
    );
}