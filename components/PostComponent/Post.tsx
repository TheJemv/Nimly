import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withSequence,
    withSpring,
    withTiming,
} from "react-native-reanimated";

import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useVideoPlayer, VideoView } from "expo-video";

import FullscreenImageViewer from "@/components/MediaMessageBubble/FullscreenImageViewer";
import FullscreenVideoViewer from "@/components/MediaMessageBubble/FullscreenVideoViewer";
import UserAvatar from "@/components/UserAvatar";
import { getThemeColor } from "@/constants/theme";

import { styles } from "./Post.styles";
import { usePost } from './hooks/usePost';

interface Props {
    post: any;
    onDelete?: () => void;
    onCommentPress?: () => void;
    /**
     * Solo importa si el post es video. Quién controla el feed (Home) decide
     * cuál post-video es "el más visible" y solo a ese le pasa `true` — así
     * nunca hay dos reproduciendo al mismo tiempo. Si nadie lo controla (ej.
     * el grid del perfil, que no trackea scroll), por default se reproduce
     * solo, sin depender de esto.
     */
    isActive?: boolean;
    /** Mute compartido entre todos los videos del feed (como Instagram: se
     *  desmutea uno y los demás seguirán así al llegar). Si no se pasa, cada
     *  post lleva su propio mute independiente. */
    muted?: boolean;
    onToggleMute?: () => void;
}

export default function PostComponent({ post, onDelete, onCommentPress, isActive = true, muted: mutedProp, onToggleMute: onToggleMuteProp }: Props) {
    const router = useRouter();
    const {
        //  Likes
        handleLike,
        handleDoubleTapLike,
        isLiked,
        likesCount,
        commentsCount,

        //  Media
        isMedia,
        isVideo,
        mediaUrl,

        //  Post
        postText,
        date,

        //  Information
        username,
        isOwner,

        //  Actions
        handleDelete,
        handleReportPost
    } = usePost(post, onDelete)

    // Zoom a pantalla completa (tap sencillo sobre la imagen).
    const [zoomVisible, setZoomVisible] = useState(false);

    // Mute propio si nadie lo controla desde afuera (ver comentario del prop).
    const [localMuted, setLocalMuted] = useState(true);
    const muted = mutedProp ?? localMuted;
    const toggleMute = onToggleMuteProp ?? (() => setLocalMuted((m) => !m));

    // Preview en línea del video: en loop, arranca/pausa según isActive.
    const previewPlayer = useVideoPlayer(isVideo && mediaUrl ? mediaUrl : null, (p) => {
        p.loop = true;
        p.muted = muted;
    });

    // El player se recrea si cambia mediaUrl, así que hay que re-aplicar el
    // mute cada vez que cambie (propio o compartido) — no solo al crearlo.
    useEffect(() => {
        try { previewPlayer.muted = muted; } catch { /* player liberado */ }
    }, [muted, previewPlayer]);

    // Solo reproduce si es el video "activo" del feed Y no está abierto en
    // pantalla completa (evita que suenen dos audios a la vez).
    useEffect(() => {
        if (!isVideo) return;
        try {
            if (isActive && !zoomVisible) previewPlayer.play();
            else previewPlayer.pause();
        } catch { /* player liberado */ }
    }, [isVideo, isActive, zoomVisible, previewPlayer]);

    // "no inicia hasta después de un rato": antes se mostraba un botón de
    // play sobre un frame congelado sin indicar que estaba cargando. Ahora
    // mostramos un spinner mientras el player buffer-ea, solo si es el que
    // debería estar reproduciendo ahora mismo.
    const [previewLoading, setPreviewLoading] = useState(true);
    useEffect(() => {
        if (!isVideo) return;
        const syncStatus = () => {
            try { setPreviewLoading(previewPlayer.status === 'loading'); } catch { /* liberado */ }
        };
        syncStatus();
        let sub: { remove: () => void } | undefined;
        try { sub = previewPlayer.addListener?.('statusChange', syncStatus); } catch { /* liberado */ }
        return () => { try { sub?.remove(); } catch { /* liberado */ } };
    }, [isVideo, previewPlayer]);

    // Corazón grande que aparece al doble-tap, estilo Instagram.
    const heartScale = useSharedValue(0);
    const heartOpacity = useSharedValue(0);
    const triggerHeartBurst = () => {
        heartOpacity.value = 1;
        heartScale.value = withSequence(
            withSpring(1.15, { damping: 9, stiffness: 220 }),
            withTiming(1, { duration: 120 }),
        );
        heartOpacity.value = withDelay(450, withTiming(0, { duration: 250 }));
    };
    const heartAnimStyle = useAnimatedStyle(() => ({
        opacity: heartOpacity.value,
        transform: [{ scale: heartScale.value }],
    }));

    const onDoubleTapImage = () => {
        triggerHeartBurst();
        handleDoubleTapLike();
    };

    // Doble-tap = like + animación. Tap sencillo = zoom a pantalla completa.
    // El single-tap espera a que el doble-tap falle para no dispararse solo.
    // Los callbacks de gesture-handler corren en el hilo de UI, así que hay
    // que cruzar a JS con runOnJS para tocar estado de React.
    const doubleTap = Gesture.Tap()
        .numberOfTaps(2)
        .maxDuration(250)
        .onEnd(() => {
            runOnJS(onDoubleTapImage)();
        });
    const singleTap = Gesture.Tap()
        .numberOfTaps(1)
        .requireExternalGestureToFail(doubleTap)
        .onEnd(() => {
            runOnJS(setZoomVisible)(true);
        });
    const imageTapGesture = Gesture.Exclusive(doubleTap, singleTap);

    return (
        <View style={styles.cardContainer}>
            <View style={styles.mainCard}>
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.userInfo}
                        onPress={() => {
                            if (isOwner) {
                                router.push("/(app)/(tabs)/(profile)");
                            } else {
                                router.push(`/(app)/user/${post.user_id}`);
                            }
                        }}
                        activeOpacity={0.7}
                    >
                        <View style={styles.avatarBorder}>
                            <View style={styles.avatarInner}>
                                <UserAvatar
                                    avatar_config={post.avatar_config}
                                    size={40}
                                />
                            </View>
                        </View>
                        <View>
                            <Text style={styles.usernameText}>@{username}</Text>
                            <Text style={styles.dateText}>{date}</Text>
                        </View>
                    </TouchableOpacity>

                    {isOwner ? (
                        <TouchableOpacity onPress={handleDelete} style={styles.moreAction}>
                            <SymbolView name="trash.fill" size={18} tintColor={getThemeColor("icon")} />
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity onPress={async () => await handleReportPost(post.id)} style={styles.moreAction}>
                            <SymbolView name="exclamationmark.triangle.fill" size={18} tintColor={getThemeColor("icon")} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* 🟢 CONTENIDO UNIFICADO: Texto y Media pueden coexistir */}
                <View style={styles.contentContainer}>
                    {postText ? (
                        <View style={styles.textFrame}>
                            <Text style={styles.bodyText}>{postText}</Text>
                        </View>
                    ) : null}

                    {/* Si hay media (imagen/video), la mostramos debajo del texto */}
                    {isMedia && mediaUrl ? (
                        <GestureDetector gesture={imageTapGesture}>
                            <View style={styles.mediaFrame}>
                                {isVideo ? (
                                    <>
                                        <VideoView
                                            player={previewPlayer}
                                            style={styles.image}
                                            contentFit="cover"
                                            nativeControls={false}
                                        />
                                        {previewLoading && isActive && (
                                            <View style={styles.playOverlay} pointerEvents="none">
                                                <ActivityIndicator color="#fff" />
                                            </View>
                                        )}
                                        <TouchableOpacity
                                            style={styles.muteButton}
                                            onPress={toggleMute}
                                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                        >
                                            <SymbolView
                                                name={muted ? "speaker.slash.fill" : "speaker.wave.2.fill"}
                                                size={13}
                                                tintColor="#fff"
                                            />
                                        </TouchableOpacity>
                                    </>
                                ) : (
                                    <Image
                                        source={{ uri: mediaUrl }}
                                        style={styles.image}
                                        contentFit="cover"
                                        transition={400}
                                    />
                                )}
                                <Animated.View style={[styles.heartBurst, heartAnimStyle]} pointerEvents="none">
                                    <SymbolView name="heart.fill" size={90} tintColor="#fff" />
                                </Animated.View>
                            </View>
                        </GestureDetector>
                    ) : null}
                </View>

                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.interactionBtn, isLiked && styles.activeBtn]}
                        onPress={handleLike}
                    >
                        <SymbolView
                            name={isLiked ? "heart.fill" : "heart"}
                            size={18}
                            tintColor={isLiked ? getThemeColor("tint") : getThemeColor("textSecondary")}
                        />
                        <Text style={[styles.interactionText, isLiked && { color: getThemeColor("tint") }]}>
                            {likesCount}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.interactionBtn}
                        onPress={onCommentPress}
                    >
                        <SymbolView name="bubble.right" size={18} tintColor={getThemeColor("textSecondary")} />
                        <Text style={styles.interactionText}>{commentsCount}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {isMedia && mediaUrl ? (
                isVideo ? (
                    <FullscreenVideoViewer
                        visible={zoomVisible}
                        uri={mediaUrl}
                        onClose={() => setZoomVisible(false)}
                    />
                ) : (
                    <FullscreenImageViewer
                        visible={zoomVisible}
                        uri={mediaUrl}
                        onClose={() => setZoomVisible(false)}
                    />
                )
            ) : null}
        </View>
    );
}