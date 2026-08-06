import { AuthContext } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { SymbolView } from "expo-symbols";
import React, { memo, useContext, useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";

// Caché simple en RAM para las Signed URLs de las historias (duran 1 hora, pero evitan fetches repetidos)
const storyUrlCache: { [path: string]: string } = {};

interface ReplyStoryProps {
    content: {
        id: string;
        user_id: string;
        media_url: string;
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
            } catch (error) {
                if (isMounted) setHasError(true);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        if (content.media_url) {
            fetchSignedUrl();
        }

        return () => { isMounted = false; };
    }, [content.media_url, session?.user]);

    return (
        <View style={[styles.container, isMyMessage ? styles.containerMine : styles.containerTheirs]}>
            <View style={styles.imageWrapper}>
                {mediaUrl && !hasError && (
                    <Image
                        source={{ uri: mediaUrl }}
                        style={styles.storyImage}
                        resizeMode="cover"
                    />
                )}

                {loading && (
                    <View style={styles.centerOverlay}>
                        <ActivityIndicator color="#fff" size="small" />
                    </View>
                )}

                {hasError && (
                    <View style={styles.centerOverlay}>
                        <SymbolView name="exclamationmark.triangle" size={28} tintColor="#ff453a" />
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
        backgroundColor: "#2C2C2E",
        overflow: "hidden",
        position: "relative",
    },
    storyImage: {
        width: "100%",
        height: "100%",
    },
    centerOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "rgba(0, 0, 0, 0.4)",
    },
});

export { ReplyStory };
