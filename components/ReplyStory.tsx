import { AuthContext } from "@/context/AuthContext";
import { getThemeColor } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { SymbolView } from "expo-symbols";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { memo, useContext, useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";

// Caché simple en RAM para las Signed URLs de las historias (duran 1 hora, pero evitan fetches repetidos)
const storyUrlCache: { [path: string]: string } = {};

const isVideoStory = (mediaType?: string | null, path?: string | null) =>
    (mediaType || "").toLowerCase() === "video" || /\.(mp4|mov|m4v)$/i.test(path || "");

interface ReplyStoryProps {
    content: {
        id: string;
        user_id: string;
        media_url: string;
        media_type?: string | null;
    };
    isMyMessage: boolean;
}

const ReplyStory = memo(({ content, isMyMessage }: ReplyStoryProps) => {
    const { session } = useContext(AuthContext)

    // Si ya la tenemos en caché, arrancamos sin loading
    const cachedUrl = storyUrlCache[content.media_url];

    const [mediaUrl, setMediaUrl] = useState<string>(cachedUrl || "");
    const [loading, setLoading] = useState<boolean>(!cachedUrl);
    const [hasError, setHasError] = useState<boolean>(false);

    const isVideo = isVideoStory(content.media_type, content.media_url);

    useEffect(() => {
        if (cachedUrl) return;

        let isMounted = true;
        const fetchSignedUrl = async () => {
            try {
                setLoading(true);
                setHasError(false);

                const { data, error } = await supabase.storage
                    .from('stories')
                    .createSignedUrl(content.media_url, 3600);

                if (error || !data?.signedUrl) throw error;

                if (isMounted) {
                    storyUrlCache[content.media_url] = data.signedUrl;
                    setMediaUrl(data.signedUrl);
                }
            } catch {
                if (isMounted) setHasError(true);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        if (content.media_url) {
            fetchSignedUrl();
        }

        return () => { isMounted = false; };
    }, [content.media_url, session?.user, cachedUrl]);

    // Historia de video: un player en pausa muestra el primer frame como
    // "portada" del preview. Sin esto el <Image> quedaba en blanco (no pinta mp4)
    // y la respuesta a la historia se veía sin miniatura.
    const player = useVideoPlayer(isVideo && mediaUrl ? mediaUrl : null, (p) => {
        p.muted = true;
        p.pause();
    });

    return (
        <View style={[styles.container, isMyMessage ? styles.containerMine : styles.containerTheirs]}>
            <View style={styles.imageWrapper}>
                {mediaUrl && !hasError && (
                    isVideo ? (
                        <VideoView
                            player={player}
                            style={styles.storyImage}
                            nativeControls={false}
                            contentFit="cover"
                        />
                    ) : (
                        <Image
                            source={{ uri: mediaUrl }}
                            style={styles.storyImage}
                            resizeMode="cover"
                        />
                    )
                )}

                {loading && (
                    <View style={styles.centerOverlay}>
                        <ActivityIndicator color="#fff" size="small" />
                    </View>
                )}

                {hasError && (
                    <View style={styles.centerOverlay}>
                        <SymbolView name="exclamationmark.triangle" size={28} tintColor={getThemeColor("error")} />
                    </View>
                )}

                {isVideo && !loading && !hasError && (
                    <View style={styles.playBadge} pointerEvents="none">
                        <SymbolView name="play.fill" size={14} tintColor="#fff" />
                    </View>
                )}
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        marginBottom: 8,
    },
    containerMine: {
        paddingRight: 10,
        borderRightWidth: 3,
        borderRightColor: '#DC143C',
        alignItems: 'flex-end',
    },
    containerTheirs: {
        paddingLeft: 10,
        borderLeftWidth: 3,
        borderLeftColor: 'rgba(255,255,255,0.6)',
        alignItems: 'flex-start',
    },
    imageWrapper: {
        width: 130,
        height: 220,
        borderRadius: 14,
        backgroundColor: getThemeColor("surface"),
        overflow: "hidden",
        position: "relative",
    },
    storyImage: {
        width: "100%",
        height: "100%",
    },
    centerOverlay: {
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "rgba(0, 0, 0, 0.4)",
    },
    playBadge: {
        position: "absolute",
        right: 8,
        bottom: 8,
        width: 26,
        height: 26,
        borderRadius: 13,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "rgba(0,0,0,0.45)",
    },
});

export { ReplyStory };
