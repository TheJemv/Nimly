import { storiesApi } from "@/api/stories";
import { Colors, getThemeColor } from "@/constants/theme";
import { StoryGroup, ViewerProfile } from "@/types/types";
import getTimeAgo from "@/utils/getTimeAgo";
import { SymbolView } from "expo-symbols";
import { Image as ExpoImage } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    ActionSheetIOS,
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Image,
    Keyboard,
    Modal,
    PanResponder,
    Platform,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CenterToast } from "../CenterToast";
import UserAvatar from "../UserAvatar";
import { styles } from "./StoryViewerModal.styles";

import { blocksApi } from "@/api/blocks";
import { reportsApi } from "@/api/reports";
import { useAuth } from "@/context/AuthContext";
import { useBlockedUsers } from "@/context/BlockedUsersContext";
import { useAnimatedValue } from "@/utils/animations";
import { getCachedMedia } from "@/utils/mediaCache";
import { promptReportReason } from "@/utils/moderation";
import { useHlsSegmentLog } from "@/utils/hlsDebug";
import { useVideoPoster } from "@/hooks/useVideoPoster";
import { buildVideoSource, FAST_START_BUFFER, prefetchHls } from "@/utils/videoSource";
import { useReplyStory, useStoryDelete, useStoryLike, useStoryNavigation, useStoryTimer, useViewsSheet } from "./hooks";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
/** Swipe down further than this (px), or flick faster (px/ms), to close. */
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 0.8;

/** Already a playable URI: nothing to resolve through the disk cache. */
const isDirectUri = (key: string) => /^(https?:|file:|data:)/.test(key);

interface StoryViewerModalProps {
    visible: boolean;
    onClose: () => void;
    initialUserId: string | null;
    storyGroups: StoryGroup[];
    onStorySeen?: (storyId: string, userId: string) => void;
    onStoryLiked?: (storyId: string, userId: string, newLikedState: boolean) => void;
    onStoryDeleted?: (storyId: string, userId: string) => void;
}

export default function StoryViewerModal({
    visible,
    onClose,
    initialUserId,
    storyGroups,
    onStorySeen,
    onStoryLiked,
    onStoryDeleted,
}: StoryViewerModalProps) {
    const insets = useSafeAreaInsets();
    const { blockLocally, unblockLocally } = useBlockedUsers();
    // Story card starts just below the status bar.
    const cardTop = insets.top > 0 ? insets.top : Platform.OS === "ios" ? 44 : 20;
    // Progress bars / header sit a touch inside the rounded top edge.
    const topSafePadding = cardTop + 10;

    // Height reserved at the bottom for the reply/actions dock. The story media
    // stops here (rounded corners) instead of running under the input.
    const DOCK_HEIGHT = insets.bottom + 72;

    // Bumped on every successful story reply to fire the "Sent" toast.
    const [sentNonce, setSentNonce] = useState(0);

    // Keep the reply dock sitting flush on top of the keyboard. A
    // KeyboardAvoidingView inside a Modal misbehaves, so we drive the bottom
    // padding from the keyboard events directly (animated to match iOS).
    const dockPad = useRef(new Animated.Value(insets.bottom)).current;
    useEffect(() => {
        const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
        const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

        const showSub = Keyboard.addListener(showEvent, (e) => {
            const h = e.endCoordinates?.height ?? 0;
            Animated.timing(dockPad, {
                toValue: Platform.OS === "ios" ? Math.max(h, insets.bottom) : 0,
                duration: (e as any).duration ?? 250,
                useNativeDriver: false,
            }).start();
        });
        const hideSub = Keyboard.addListener(hideEvent, (e) => {
            Animated.timing(dockPad, {
                toValue: insets.bottom,
                duration: (e as any)?.duration ?? 200,
                useNativeDriver: false,
            }).start();
        });

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, [dockPad, insets.bottom]);

    const {
        currentGroup,
        currentStory,
        currentStoryIdx,
        nextStory,
        isVideo,
        handleNextStory,
        handlePrevStory,
    } = useStoryNavigation({
        storyGroups,
        initialUserId,
        visible,
        onAllStoriesFinished: () => handleClose(),
    });

    const { toggleLike } = useStoryLike({
        currentStory,
        currentGroup,
        onStoryLiked,
    });

    const { isViewsSheetOpen, sheetAnim, openViewsSheet, closeViewsSheet, resetSheet } = useViewsSheet();

    // HLS streaming for the story's video: if it's already transcoded
    // ('ready') we serve the playlist authenticated via the media API;
    // otherwise the MP4 signed URL (currentStory.media_url) as always. If
    // the player blows up with HLS -> storyHlsFailed and we fall back to the
    // MP4 without skipping the story.
    const { session } = useAuth();
    // Keyed by story id so the next story never starts out on the MP4 path
    // just because the previous one's HLS failed.
    const [hlsFailedStoryId, setHlsFailedStoryId] = useState<string | null>(null);
    const storyHlsFailed = !!currentStory && hlsFailedStoryId === currentStory.id;

    // Story media resolved via disk cache (mediaCache) by the bare path:
    // 1st view downloads + signs, subsequent ones = local `file://`, zero
    // network. If the cache fails it degrades to the remote URL (or to the
    // path, which the player will ignore).
    //
    // Same as with posts: if it's a video with HLS ready and no failure we
    // do NOT touch the MP4 (bandwidth). We only resolve it for images, video
    // without HLS ('raw'/'error'), or after storyHlsFailed.
    const storyMediaKey = currentStory?.media_path || currentStory?.media_url || null;
    const storyNeedsMp4 =
        currentStory?.media_type !== 'video' ||
        currentStory?.playback_status !== 'ready' ||
        storyHlsFailed;
    // Keyed by media key: the previous story's URI must never be used, not
    // even for the one render before the new one resolves (it flashed the old
    // image and started the bar before the real one loaded).
    const [cachedMedia, setCachedMedia] = useState<{ key: string; uri: string } | null>(null);
    // Filled in once the timer exists (it's created further down).
    const failMediaRef = useRef<() => void>(() => {});
    useEffect(() => {
        if (!storyNeedsMp4) return;
        if (!storyMediaKey) { failMediaRef.current(); return; }
        if (isDirectUri(storyMediaKey)) return;
        let active = true;
        getCachedMedia('stories', storyMediaKey, { signed: true, ttl: 3600 })
            .then((uri) => {
                if (!active) return;
                if (uri) setCachedMedia({ key: storyMediaKey, uri });
                else failMediaRef.current();
            })
            .catch(() => { if (active) failMediaRef.current(); });
        return () => { active = false; };
    }, [storyMediaKey, storyNeedsMp4]);
    const resolvedStoryUri =
        !storyMediaKey || !storyNeedsMp4 ? null
            : isDirectUri(storyMediaKey) ? storyMediaKey
                : cachedMedia?.key === storyMediaKey ? cachedMedia.uri : null;

    const storyVideoSource = useMemo(
        () => buildVideoSource({
            ownerId: currentStory?.user_id,
            mediaId: currentStory?.id,
            playbackStatus: currentStory?.playback_status,
            mp4Url: resolvedStoryUri,
            accessToken: session?.access_token,
            hlsFailed: storyHlsFailed,
        }),
        [currentStory?.user_id, currentStory?.id, currentStory?.playback_status, resolvedStoryUri, session?.access_token, storyHlsFailed],
    );

    const handleStoryVideoError = () => {
        if (currentStory?.playback_status === 'ready' && !storyHlsFailed) {
            setHlsFailedStoryId(currentStory.id);
            return true; // handled: don't skip to the next story
        }
        return false;
    };

    const videoPlayer = useVideoPlayer(
        isVideo ? storyVideoSource : null,
        (player) => {
            player.loop = false;
            player.bufferOptions = FAST_START_BUFFER;
        }
    );

    // dev-only: logs HLS segments as they enter the buffer.
    useHlsSegmentLog(videoPlayer, storyVideoSource, `story:${String(currentStory?.id ?? "?").slice(0, 8)}`);

    // First frame of the video story: painted while it loads instead of the
    // black background. Cached by id, so going back/forward shows it instantly.
    const storyPoster = useVideoPoster(isVideo ? videoPlayer : null, currentStory?.id);

    const {
        progressAnim,
        isMediaLoading,
        mediaFailed,
        isHolding,
        handleMediaReady,
        handleMediaFailed,
        handlePressIn,
        handlePressOut,
        wasTapAction,
        restartStory,
        pause,
        resume,
    } = useStoryTimer({
        storyKey: currentStory?.id,
        isVideo,
        videoPlayer,
        onNext: handleNextStory,
        isEnabled: visible,
        onVideoError: handleStoryVideoError,
        onMarkAsSeen: () => {
            if (currentStory && currentGroup && !currentStory.is_seen_by_me && !currentGroup.is_me) {
                onStorySeen?.(currentStory.id, currentGroup.user_id);
                storiesApi.markAsSeen(currentStory.id);
            }
        },
    });
    failMediaRef.current = handleMediaFailed;

    const { handleDeleteStory } = useStoryDelete({
        currentStory,
        currentGroup,
        onStoryDeleted,
        pause,
        resume,
    });

    const {
        replyTextStory,
        loadingReplyStory,
        setReplyTextStory,
        handleReplyStory,
    } = useReplyStory(currentGroup, currentStory?.id, () => setSentNonce((n) => n + 1));

    const sortedViewers = useMemo(() => {
        if (!currentStory?.viewers) return [];
        return [...currentStory.viewers].sort((a, b) => {
            if (a.has_liked && !b.has_liked) return -1;
            if (!a.has_liked && b.has_liked) return 1;
            return 0;
        });
    }, [currentStory]);

    // New story: no sheet left open, and a half-written reply doesn't follow
    // you to someone else's story.
    useEffect(() => {
        if (!currentStory) return;
        if (isViewsSheetOpen) {
            resetSheet();
            resume("sheet");
        }
        setReplyTextStory("");
    }, [currentStory?.id]);

    // Warm up the next story while this one plays, so tapping forward doesn't
    // start from a spinner. Waits until the current one is on screen so it
    // never competes with it for bandwidth. Raw MP4s are skipped: they'd be
    // downloaded whole.
    useEffect(() => {
        if (isMediaLoading || !nextStory) return;
        if (nextStory.media_type === "video") {
            prefetchHls(
                { id: nextStory.id, ownerId: nextStory.user_id, playbackStatus: nextStory.playback_status },
                session?.access_token,
            );
            return;
        }
        const key = nextStory.media_path || nextStory.media_url;
        if (key && !isDirectUri(key)) {
            getCachedMedia('stories', key, { signed: true, ttl: 3600 }).catch(() => {});
        }
    }, [isMediaLoading, nextStory?.id]);

    // While writing a reply, a tap on the story closes the keyboard instead of
    // jumping to another story (there was no other way to close it).
    const replyFocusedRef = useRef(false);

    const handleTap = (direction: "prev" | "next") => {
        if (isViewsSheetOpen) return;
        if (replyFocusedRef.current) {
            Keyboard.dismiss();
            return;
        }
        if (!wasTapAction()) return;
        if (direction === "next") handleNextStory();
        else if (!handlePrevStory()) restartStory();
    };

    const handleClose = () => {
        pause("closing");
        resetSheet();
        onClose();
    };

    // Nothing left to show (last story deleted, its user blocked, expired...).
    useEffect(() => {
        if (visible && !currentStory) handleClose();
    }, [visible, currentStory]);

    const [isReporting, setIsReporting] = useState<boolean>(false)

    const reportedStoryIdsRef = useRef<Set<string>>(new Set());
    const isReportingRef = useRef(false);

    // --- SWIPE-TO-CLOSE ---
    const panY = useAnimatedValue(0);
    // The black backdrop fades as you drag, uncovering the feed underneath.
    const backdropOpacity = panY.interpolate({
        inputRange: [0, SCREEN_HEIGHT * 0.5],
        outputRange: [1, 0],
        extrapolate: "clamp",
    });

    useEffect(() => {
        if (visible) panY.setValue(0);
    }, [visible]);

    // The responder is created once: it reads the latest state through this ref.
    const gestureRef = useRef({ isViewsSheetOpen, handleClose, pause, resume });
    gestureRef.current = { isViewsSheetOpen, handleClose, pause, resume };

    const panResponder = useMemo(() => {
        const snapBack = () => {
            Animated.spring(panY, { toValue: 0, bounciness: 0, useNativeDriver: false }).start();
            gestureRef.current.resume("drag");
        };

        return PanResponder.create({
            // Downward and mostly vertical only: horizontal moves and swipes up
            // stay with the story (hold to pause).
            onMoveShouldSetPanResponder: (_e, g) =>
                !gestureRef.current.isViewsSheetOpen && g.dy > 10 && g.dy > Math.abs(g.dx) * 1.2,
            // The story stops while you drag it (it used to keep running and
            // could jump to the next one mid-gesture).
            onPanResponderGrant: () => gestureRef.current.pause("drag"),
            onPanResponderMove: (_e, g) => panY.setValue(Math.max(0, g.dy)),
            onPanResponderTerminationRequest: () => false,
            onPanResponderRelease: (_e, g) => {
                if (g.dy > CLOSE_DISTANCE || (g.vy > CLOSE_VELOCITY && g.dy > 20)) {
                    Animated.timing(panY, {
                        toValue: SCREEN_HEIGHT,
                        duration: 180,
                        useNativeDriver: false,
                    }).start(() => gestureRef.current.handleClose());
                } else {
                    snapBack();
                }
            },
            // Interrupted (system gesture, call...): never leave the card halfway.
            onPanResponderTerminate: snapBack,
        });
    }, [panY]);

    const doReportStory = async () => {
        if (!currentStory || !currentGroup) return;
        if (isReportingRef.current) return;
        if (reportedStoryIdsRef.current.has(currentStory.id)) {
            Alert.alert("Note", "You have already reported this story.");
            return;
        }

        const reason = await promptReportReason("Report story", "Why are you reporting this story?");
        if (!reason) return;

        isReportingRef.current = true;
        setIsReporting(true);
        try {
            const res = await reportsApi.submitReport({
                targetStoryId: currentStory.id,
                reason,
            });
            if (res?.success) {
                reportedStoryIdsRef.current.add(currentStory.id);
                Alert.alert("Report received", "Thanks. Our team reviews reports within 24 hours.");
            }
        } catch (e: any) {
            if (e.message === "AlreadyReported") {
                reportedStoryIdsRef.current.add(currentStory.id);
                Alert.alert("Note", "You have already reported this story.");
            } else {
                Alert.alert("Error", "Failed to report the story. Please try again later.");
            }
        } finally {
            isReportingRef.current = false;
            setIsReporting(false);
        }
    };

    const doBlockStoryOwner = async () => {
        if (!currentGroup) return;
        const targetId = currentGroup.user_id;
        const reason = await promptReportReason(
            "Block user",
            "Tell us what's wrong so we can review this account.",
        );
        blockLocally(targetId);
        handleClose();
        try {
            await blocksApi.blockUser(targetId, reason ?? 'other');
        } catch (e: any) {
            if (e?.message !== "AlreadyBlocked") {
                unblockLocally(targetId);
                Alert.alert("Error", "Action could not be completed.");
            }
        }
    };

    const handleReport = () => {
        if (!currentStory || !currentGroup || currentGroup.is_me) return;

        pause("menu");
        const label = `@${currentGroup.username || 'user'}`;
        const done = () => resume("menu");

        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    options: ['Cancel', 'Report story', `Block ${label}`],
                    destructiveButtonIndex: 2,
                    cancelButtonIndex: 0,
                    title: 'This story',
                },
                (index) => {
                    if (index === 1) doReportStory().finally(done);
                    else if (index === 2) doBlockStoryOwner().finally(done);
                    else done();
                },
            );
        } else {
            Alert.alert('This story', undefined, [
                { text: 'Cancel', style: 'cancel', onPress: done },
                { text: 'Report story', onPress: () => doReportStory().finally(done) },
                { text: `Block ${label}`, style: 'destructive', onPress: () => doBlockStoryOwner().finally(done) },
            ]);
        }
    };

    // Every hook is above this line: returning early before one of them made
    // React crash when the current story disappeared mid-view.
    if (!visible || !currentGroup || !currentStory) return null;
    const currentLikedStatus = currentStory.is_liked_by_me || false;

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent={true}
            onRequestClose={handleClose}
            statusBarTranslucent
        >
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: backdropOpacity }]} />

            <Animated.View
                style={[styles.container, { transform: [{ translateY: panY }] }]}
                {...panResponder.panHandlers}
            >
                {/* pointerEvents none: the spinner used to swallow every tap, so a
                    story that never loaded couldn't be skipped. */}
                {isMediaLoading && !mediaFailed && (
                    <View style={styles.loaderContainer} pointerEvents="none">
                        <ActivityIndicator size="large" color={Colors.dark.tint} />
                    </View>
                )}

                {isReporting && (
                    <View style={styles.loaderContainer}>
                        <ActivityIndicator size="large" color={Colors.dark.tint} />
                        <Text style={{ color: '#fff', marginTop: 12, fontSize: 13 }}>Reporting...</Text>
                    </View>
                )}

                <View style={[styles.mediaCard, { top: cardTop, bottom: DOCK_HEIGHT }]}>
                    {isVideo ? (
                        <>
                            <VideoView
                                key={currentStory.id}
                                player={videoPlayer}
                                style={styles.storyMedia}
                                nativeControls={false}
                                contentFit="cover"
                                onFirstFrameRender={handleMediaReady}
                            />
                            {storyPoster && isMediaLoading && (
                                <ExpoImage
                                    source={storyPoster}
                                    style={styles.storyMedia}
                                    contentFit="cover"
                                />
                            )}
                        </>
                    ) : resolvedStoryUri ? (
                        <Image
                            key={currentStory.id}
                            source={{ uri: resolvedStoryUri, cache: "force-cache" }}
                            style={styles.storyMedia}
                            resizeMode="cover"
                            fadeDuration={0}
                            onLoad={handleMediaReady}
                            onError={handleMediaFailed}
                        />
                    ) : null}

                    {mediaFailed && (
                        <View style={styles.failedContainer} pointerEvents="none">
                            <SymbolView name="exclamationmark.triangle" size={28} tintColor="rgba(255,255,255,0.7)" />
                            <Text style={styles.failedText}>Couldn't load this story</Text>
                        </View>
                    )}

                    <View style={styles.touchOverlay}>
                        <Pressable style={styles.touchLeft} onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={() => handleTap("prev")} />
                        <Pressable style={styles.touchRight} onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={() => handleTap("next")} />
                    </View>
                </View>

                <View
                    style={[styles.uiOverlay, { paddingTop: topSafePadding }, isHolding && styles.hiddenUI]}
                    pointerEvents="box-none"
                >
                    <View style={styles.topSection}>
                        <View style={styles.progressContainer}>
                            {currentGroup.stories.map((story, index) => {
                                let barWidth: any = "0%";
                                if (index < currentStoryIdx) {
                                    barWidth = "100%";
                                } else if (index === currentStoryIdx) {
                                    barWidth = progressAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: ["0%", "100%"],
                                    });
                                }
                                // Animated moves the active fill outside React, so React
                                // still thinks it's at the width of its last render (~0%).
                                // Going back turned it into a static "0%" React saw as no
                                // change, and the bar stayed half full. A fresh fill per
                                // state always starts from the right width.
                                const barState = index < currentStoryIdx ? "done" : index === currentStoryIdx ? "active" : "todo";

                                return (
                                    <View key={story.id} style={styles.progressBarBackground}>
                                        <Animated.View key={barState} style={[styles.progressBarFill, { width: barWidth }]} />
                                    </View>
                                );
                            })}
                        </View>

                        <View style={styles.header}>
                            <View style={styles.userInfo}>
                                <View style={styles.headerAvatarContainer}>
                                    <UserAvatar
                                        avatar_config={currentGroup.avatar_config}
                                        size={28}
                                    />
                                </View>
                                <View style={styles.userTextContainer}>
                                    <Text style={styles.headerUsername}>{currentGroup.username}</Text>
                                    <Text style={styles.timeAgoText}>{getTimeAgo(currentStory.created_at)}</Text>
                                </View>
                            </View>

                            <View style={styles.actionsTop}>
                                {!currentGroup.is_me && (
                                    <TouchableOpacity onPress={handleReport} style={styles.closeButton} activeOpacity={0.7} disabled={isReporting}>
                                        <SymbolView name={"exclamationmark"} size={16} tintColor={Colors.dark.text} />
                                    </TouchableOpacity>
                                )}

                                <TouchableOpacity onPress={handleClose} style={styles.closeButton} activeOpacity={0.7}>
                                    <SymbolView name={"xmark"} size={16} tintColor={Colors.dark.text} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>

                <Animated.View
                    style={[
                        styles.footerDock,
                        { paddingBottom: dockPad },
                        isHolding && styles.hiddenUI,
                    ]}
                    pointerEvents="box-none"
                >
                    <View style={styles.footer}>
                        {currentGroup.is_me ? (
                            <View style={styles.myActions}>
                                <TouchableOpacity
                                    style={styles.likeButton}
                                    activeOpacity={0.8}
                                    onPress={() => openViewsSheet(() => pause("sheet"))}
                                >
                                    <SymbolView name={"eye"} size={22} tintColor={getThemeColor("tint")} />
                                </TouchableOpacity>

                                <TouchableOpacity onPress={handleDeleteStory} style={styles.likeButton} activeOpacity={0.8}>
                                    <SymbolView name={"trash"} tintColor={getThemeColor("tint")} size={22} />
                                </TouchableOpacity>
                            </View>
                        ) : (
                            // ScrollView (active scroll, only capped by maxHeight)
                            // so keyboardShouldPersistTaps takes effect: without
                            // this, the first tap on the button gets eaten by the
                            // keyboard closing. See facebook/react-native#28871.
                            <ScrollView
                                style={styles.replyRowScroll}
                                contentContainerStyle={styles.actionsContainer}
                                keyboardShouldPersistTaps="always"
                                showsVerticalScrollIndicator={false}
                                bounces={false}
                            >
                                <TextInput
                                    style={styles.textInputReply}
                                    placeholder="Reply to story..."
                                    placeholderTextColor="rgba(255, 255, 255, 0.6)"

                                    onFocus={() => {
                                        replyFocusedRef.current = true;
                                        pause("reply");
                                    }}
                                    onBlur={() => {
                                        replyFocusedRef.current = false;
                                        resume("reply");
                                    }}

                                    onChangeText={e => setReplyTextStory(e)}
                                    value={replyTextStory}

                                    returnKeyType="send"
                                    blurOnSubmit={false}
                                    onSubmitEditing={handleReplyStory}
                                />

                                {replyTextStory ? (
                                    // onPressIn (not onPress): extra fallback in
                                    // case the tap gets lost when the keyboard closes.
                                    <TouchableOpacity disabled={loadingReplyStory} onPressIn={handleReplyStory} hitSlop={8} style={styles.likeButton} activeOpacity={0.8}>
                                        {loadingReplyStory ? (
                                            <ActivityIndicator color={getThemeColor("tint")} />
                                        ) : (
                                            <SymbolView
                                                name={"paperplane.fill"}
                                                tintColor={"#fff"}
                                                size={22}
                                            />
                                        )}
                                    </TouchableOpacity>
                                ) : (
                                    <TouchableOpacity onPress={toggleLike} style={styles.likeButton} activeOpacity={0.8}>
                                        <SymbolView
                                            name={currentLikedStatus ? "heart.fill" : "heart"}
                                            tintColor={currentLikedStatus ? getThemeColor("tint") : getThemeColor("textSecondary")}
                                            size={22}
                                        />
                                    </TouchableOpacity>
                                )}
                            </ScrollView>
                        )}
                    </View>
                </Animated.View>

                {isViewsSheetOpen && (
                    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                        <Pressable style={styles.backdrop} onPress={() => closeViewsSheet(() => resume("sheet"))} />

                        <Animated.View style={[styles.sheetContainer, { transform: [{ translateY: sheetAnim }] }]}>
                            <View style={styles.sheetHandle} />

                            <View style={styles.sheetHeader}>
                                <Text style={styles.sheetTitle}>Viewers</Text>
                                <Text style={styles.sheetSubTitle}>
                                    {currentStory.views_count || 0} people viewed your story
                                </Text>
                            </View>

                            <FlatList
                                data={sortedViewers}
                                keyExtractor={(item, index) => `${item.user_id}-${index}`}
                                contentContainerStyle={styles.listContent}
                                renderItem={({ item }: { item: ViewerProfile }) => (
                                    <View style={styles.viewerRow}>
                                        <View style={styles.viewerLeft}>
                                            <View style={styles.viewerAvatar}>
                                                <UserAvatar avatar_config={item.avatar_config} size={40} />
                                            </View>
                                            <Text style={styles.viewerUsername}>@{item.username}</Text>
                                        </View>

                                        {item.has_liked && (
                                            <SymbolView name="heart.fill" size={18} tintColor={getThemeColor("tint")} />
                                        )}
                                    </View>
                                )}
                                ListEmptyComponent={
                                    <View style={styles.emptyContainer}>
                                        <SymbolView name="eye.slash" size={36} tintColor="rgba(255,255,255,0.3)" />
                                        <Text style={styles.emptyText}>No views yet</Text>
                                    </View>
                                }
                            />
                        </Animated.View>
                    </View>
                )}

                <CenterToast message="Sent" trigger={sentNonce} />
            </Animated.View>
        </Modal>
    );
}