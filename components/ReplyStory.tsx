import { AuthContext } from "@/context/AuthContext";
import { getThemeColor } from "@/constants/theme";
import { getCachedMedia } from "@/utils/mediaCache";
import { SymbolView } from "expo-symbols";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { memo, useContext, useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";

// In-memory cache of the already-resolved local `file://` (avoids even the
// disk getInfoAsync call when the bubble re-mounts). The real, persistent
// cache lives in mediaCache.
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

    // If we already have it cached, we start without loading
    const cachedUrl = storyUrlCache[content.media_url];

    const [mediaUrl, setMediaUrl] = useState<string>(cachedUrl || "");
    const [loading, setLoading] = useState<boolean>(!cachedUrl);
    const [hasError, setHasError] = useState<boolean>(false);

    const isVideo = isVideoStory(content.media_type, content.media_url);

    useEffect(() => {
        if (cachedUrl) return;
        if (!content.media_url) return;

        let isMounted = true;
        const resolve = async () => {
            try {
                setLoading(true);
                setHasError(false);

                // 1st time downloads + signs; subsequent times = local `file://`, zero network.
                const uri = await getCachedMedia('stories', content.media_url, { signed: true, ttl: 3600 });
                if (!uri) throw new Error("story media unavailable");

                if (isMounted) {
                    storyUrlCache[content.media_url] = uri;
                    setMediaUrl(uri);
                }
            } catch {
                if (isMounted) setHasError(true);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        resolve();

        return () => { isMounted = false; };
    }, [content.media_url, session?.user, cachedUrl]);

    // Video story: a paused player shows the first frame as the preview's
    // "cover". Without this the <Image> stayed blank (it doesn't render mp4)
    // and the reply to the story showed with no thumbnail.
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
