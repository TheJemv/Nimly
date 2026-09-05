import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from "react-native";
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

import FullscreenImageViewer from "@/components/MediaMessageBubble/FullscreenImageViewer";
import UserAvatar from "@/components/UserAvatar";
import { getThemeColor } from "@/constants/theme";

import { styles } from "./Post.styles";
import { usePost } from './hooks/usePost';

interface Props {
    post: any;
    onDelete?: () => void;
    onCommentPress?: () => void;
}

export default function PostComponent({ post, onDelete, onCommentPress }: Props) {
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
                            <SymbolView name="trash.fill" size={18} tintColor="#48484A" />
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity onPress={async () => await handleReportPost(post.id)} style={styles.moreAction}>
                            <SymbolView name="exclamationmark.triangle.fill" size={18} tintColor="#48484A" />
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
                                <Image
                                    source={{ uri: mediaUrl }}
                                    style={styles.image}
                                    contentFit="cover"
                                    transition={400}
                                />
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
                            tintColor={isLiked ? getThemeColor("tint") : "#636366"}
                        />
                        <Text style={[styles.interactionText, isLiked && { color: getThemeColor("tint") }]}>
                            {likesCount}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.interactionBtn}
                        onPress={onCommentPress}
                    >
                        <SymbolView name="bubble.right" size={18} tintColor="#636366" />
                        <Text style={styles.interactionText}>{commentsCount}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {isMedia && mediaUrl ? (
                <FullscreenImageViewer
                    visible={zoomVisible}
                    uri={mediaUrl}
                    onClose={() => setZoomVisible(false)}
                />
            ) : null}
        </View>
    );
}