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

import { useHlsSegmentLog } from "@/utils/hlsDebug";
import { useVideoPoster } from "@/hooks/useVideoPoster";
import { FAST_START_BUFFER } from "@/utils/videoSource";

import { styles } from "./Post.styles";
import { usePost } from './hooks/usePost';

interface Props {
    post: any;
    onDelete?: () => void;
    onCommentPress?: () => void;
    /**
     * Only matters if the post is a video. Whoever controls the feed (Home)
     * decides which video-post is "the most visible" and only passes `true`
     * to that one — so two never play at the same time. If nothing controls
     * it (e.g. the profile grid, which doesn't track scroll), it plays on its
     * own by default, without relying on this.
     */
    isActive?: boolean;
    /** Mute shared across all videos in the feed (like Instagram: unmute one
     *  and the rest will stay unmuted when you reach them). If not passed,
     *  each post keeps its own independent mute. */
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
        videoSource,
        handleVideoError,

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

    // Full-screen zoom (single tap on the image).
    const [zoomVisible, setZoomVisible] = useState(false);

    // Own mute state if nothing controls it from outside (see prop comment above).
    const [localMuted, setLocalMuted] = useState(true);
    const muted = mutedProp ?? localMuted;
    const toggleMute = onToggleMuteProp ?? (() => setLocalMuted((m) => !m));

    // Inline video preview: loops, starts/pauses based on isActive.
    // The source is HLS if the post is already transcoded ('ready'), otherwise the MP4.
    const previewPlayer = useVideoPlayer(isVideo && videoSource ? videoSource : null, (p) => {
        p.loop = true;
        p.muted = muted;
        p.bufferOptions = FAST_START_BUFFER;
    });

    // dev-only: logs HLS segments as they enter the buffer.
    useHlsSegmentLog(previewPlayer, videoSource, `post:${String(post.id).slice(0, 8)}`);

    // First frame of the video: painted as background while the player buffers,
    // instead of the usual black rectangle.
    const poster = useVideoPoster(isVideo ? previewPlayer : null, post.id);

    // The player is recreated if mediaUrl changes, so we need to re-apply the
    // mute every time it changes (own or shared) — not just when it's created.
    useEffect(() => {
        try { previewPlayer.muted = muted; } catch { /* player released */ }
    }, [muted, previewPlayer]);

    // Only plays if it's the feed's "active" video AND it's not open in
    // full screen (avoids two audio tracks playing at once).
    useEffect(() => {
        if (!isVideo) return;
        try {
            if (isActive && !zoomVisible) previewPlayer.play();
            else previewPlayer.pause();
        } catch { /* player released */ }
    }, [isVideo, isActive, zoomVisible, previewPlayer]);

    // "doesn't start for a while": we used to show a play button over a
    // frozen frame without indicating it was loading. Now we show a spinner
    // while the player buffers, but only if it's the one that should be
    // playing right now.
    const [previewLoading, setPreviewLoading] = useState(true);
    useEffect(() => {
        if (!isVideo) return;
        const syncStatus = () => {
            try {
                const st = previewPlayer.status;
                setPreviewLoading(st === 'loading');
                // HLS blew up -> usePost falls back to the MP4 and the player is recreated with it.
                if (st === 'error') handleVideoError();
            } catch { /* released */ }
        };
        syncStatus();
        let sub: { remove: () => void } | undefined;
        try { sub = previewPlayer.addListener?.('statusChange', syncStatus); } catch { /* released */ }
        return () => { try { sub?.remove(); } catch { /* released */ } };
    }, [isVideo, previewPlayer, handleVideoError]);

    // Big heart that appears on double-tap, Instagram style.
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

    // Mute button: its own gesture, separate from the image's. A normal
    // TouchableOpacity mounted ON TOP of a View with GestureDetector isn't
    // enough to win priority -- they're two different touch systems and both
    // fired at once (tapping mute also opened the zoom). With
    // requireExternalGestureToFail below, the single tap waits for the mute
    // gesture to fail (i.e. the touch landed outside its button) before
    // trying to activate.
    const muteTap = Gesture.Tap()
        .hitSlop({ top: 10, bottom: 10, left: 10, right: 10 })
        .onEnd(() => {
            runOnJS(toggleMute)();
        });

    // Double-tap = like + animation. Single tap = full-screen zoom.
    // The single-tap waits for the double-tap (and the mute one) to fail so
    // it doesn't fire on its own. gesture-handler callbacks run on the UI
    // thread, so we need to cross to JS with runOnJS to touch React state.
    const doubleTap = Gesture.Tap()
        .numberOfTaps(2)
        .maxDuration(250)
        .onEnd(() => {
            runOnJS(onDoubleTapImage)();
        });
    const singleTap = Gesture.Tap()
        .numberOfTaps(1)
        .requireExternalGestureToFail(doubleTap, muteTap)
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

                {/* UNIFIED CONTENT: Text and Media can coexist */}
                <View style={styles.contentContainer}>
                    {postText ? (
                        <View style={styles.textFrame}>
                            <Text style={styles.bodyText}>{postText}</Text>
                        </View>
                    ) : null}

                    {/* If there's media (image/video), we show it below the text.
                        Video: videoSource alone is enough (HLS ready even if the
                        signed URL for the MP4 hasn't resolved yet). Image: mediaUrl. */}
                    {isMedia && (mediaUrl || videoSource) ? (
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
                                        {poster && previewLoading && (
                                            <Image
                                                source={poster}
                                                style={styles.posterOverlay}
                                                contentFit="cover"
                                            />
                                        )}
                                        {previewLoading && isActive && (
                                            <View style={styles.playOverlay} pointerEvents="none">
                                                <ActivityIndicator color="#fff" />
                                            </View>
                                        )}
                                        <GestureDetector gesture={muteTap}>
                                            <View style={styles.muteButton}>
                                                <SymbolView
                                                    name={muted ? "speaker.slash.fill" : "speaker.wave.2.fill"}
                                                    size={13}
                                                    tintColor="#fff"
                                                />
                                            </View>
                                        </GestureDetector>
                                    </>
                                ) : (
                                    <Image
                                        source={{ uri: mediaUrl ?? undefined }}
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

            {isMedia && (mediaUrl || videoSource) ? (
                isVideo ? (
                    <FullscreenVideoViewer
                        visible={zoomVisible}
                        uri={videoSource ?? mediaUrl}
                        onClose={() => setZoomVisible(false)}
                        onError={handleVideoError}
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