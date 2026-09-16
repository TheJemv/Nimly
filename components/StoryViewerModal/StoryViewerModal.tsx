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
import { buildVideoSource, FAST_START_BUFFER } from "@/utils/videoSource";
import { useReplyStory, useStoryDelete, useStoryLike, useStoryNavigation, useStoryTimer, useViewsSheet } from "./hooks";

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
        currentUserIdx,
        setCurrentUserIdx,
        currentStoryIdx,
        setCurrentStoryIdx,
        localStories,
        setLocalStories,
        currentGroup,
        currentStory,
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
        setLocalStories,
        onStoryLiked,
    });

    const { isViewsSheetOpen, sheetAnim, openViewsSheet, closeViewsSheet, resetSheet } = useViewsSheet();

    // HLS streaming for the story's video: if it's already transcoded
    // ('ready') we serve the playlist authenticated via the media API;
    // otherwise the MP4 signed URL (currentStory.media_url) as always. If
    // the player blows up with HLS -> storyHlsFailed and we fall back to the
    // MP4 without skipping the story.
    const { session } = useAuth();
    const [storyHlsFailed, setStoryHlsFailed] = useState(false);
    useEffect(() => { setStoryHlsFailed(false); }, [currentStory?.id]);

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
    const [resolvedStoryUri, setResolvedStoryUri] = useState<string | null>(null);
    useEffect(() => {
        let active = true;
        if (!storyMediaKey || !storyNeedsMp4) { setResolvedStoryUri(null); return; }
        if (/^(https?:|file:|data:)/.test(storyMediaKey)) {
            setResolvedStoryUri(storyMediaKey);
            return;
        }
        setResolvedStoryUri(null);
        getCachedMedia('stories', storyMediaKey, { signed: true, ttl: 3600 })
            .then((uri) => { if (active) setResolvedStoryUri(uri ?? storyMediaKey); })
            .catch(() => { if (active) setResolvedStoryUri(storyMediaKey); });
        return () => { active = false; };
    }, [storyMediaKey, storyNeedsMp4]);

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
            setStoryHlsFailed(true);
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
        isHolding,
        resetTimer,
        handleMediaReady,
        handlePressIn,
        handlePressOut,
        wasTapAction,
        pauseTimerForSheet,
        resumeTimerFromSheet,
    } = useStoryTimer({
        isVideo,
        videoPlayer,
        onNext: handleNextStory,
        isEnabled: visible,
        isViewsSheetOpen,
        onVideoError: handleStoryVideoError,
        onMarkAsSeen: () => {
            if (currentStory && !currentStory.is_seen_by_me && !currentGroup.is_me) {
                onStorySeen?.(currentStory.id, currentGroup.user_id);
                storiesApi.markAsSeen(currentStory.id);
            }
        },
    });

    const { handleDeleteStory } = useStoryDelete({
        currentStory,
        currentGroup,
        localStories,
        setLocalStories,
        currentStoryIdx,
        setCurrentStoryIdx,
        currentUserIdx,
        setCurrentUserIdx,
        totalGroups: storyGroups.length,
        onStoryDeleted,
        resetTimer,
        pauseTimer: pauseTimerForSheet,
        afterDelete: resumeTimerFromSheet,
        onLastStoryOfLastGroup: () => handleClose(),
    });

    const sortedViewers = useMemo(() => {
        if (!currentStory?.viewers) return [];
        return [...currentStory.viewers].sort((a, b) => {
            if (a.has_liked && !b.has_liked) return -1;
            if (!a.has_liked && b.has_liked) return 1;
            return 0;
        });
    }, [currentStory]);

    useEffect(() => {
        if (!visible || !currentStory || !currentGroup) return;
        resetTimer();
        resetSheet();
    }, [currentUserIdx, currentStoryIdx, visible]);

    const handleTapLeft = () => {
        if (isViewsSheetOpen) return;
        if (wasTapAction()) handlePrevStory();
    };

    const handleTapRight = () => {
        if (isViewsSheetOpen) return;
        if (wasTapAction()) handleNextStory();
    };

    const handleClose = () => {
        resetTimer();
        // expo-video may have released the native player (end of stories /
        // unmount): the call throws NotFoundException if not guarded.
        try { if (isVideo && videoPlayer) videoPlayer.pause(); } catch { /* player released */ }
        resetSheet();
        onClose();
    };

    const [isReporting, setIsReporting] = useState<boolean>(false)

    const reportedStoryIdsRef = useRef<Set<string>>(new Set());
    const isReportingRef = useRef(false);

    // --- SWIPE-TO-CLOSE ANIMATION ---
    const panY = useAnimatedValue(0)
    const isViewsSheetOpenRef = useRef(isViewsSheetOpen);
    useEffect(() => {
        isViewsSheetOpenRef.current = isViewsSheetOpen;
    }, [isViewsSheetOpen]);

    useEffect(() => {
        if (visible) {
            panY.setValue(0);
        }
    }, [visible]);

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (e, gestureState) => {
                if (isViewsSheetOpenRef.current) return false;
                return Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && Math.abs(gestureState.dy) > 15;
            },
            onPanResponderMove: Animated.event(
                [null, { dy: panY }],
                { useNativeDriver: false }
            ),
            onPanResponderRelease: (e, gestureState) => {
                if (gestureState.dy > 120) {
                    Animated.timing(panY, {
                        toValue: 1000,
                        duration: 150,
                        useNativeDriver: true,
                    }).start(() => {
                        handleClose();
                    });
                } else {
                    Animated.spring(panY, {
                        toValue: 0,
                        useNativeDriver: true,
                    }).start();
                }
            },
        })
    ).current;

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
        onClose();
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

        pauseTimerForSheet();
        const label = `@${currentGroup.username || 'user'}`;
        const done = () => resumeTimerFromSheet();

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

    if (!visible || !currentGroup || !currentStory) return null;
    const currentLikedStatus = (currentStory as any).is_liked_by_me || false;

    const {
        replyTextStory,
        loadingReplyStory,
        setReplyTextStory,
        handleReplyStory,
    } = useReplyStory(currentGroup, currentStory.id, () => setSentNonce((n) => n + 1))

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent={true}
            onRequestClose={handleClose}
            statusBarTranslucent
        >
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />

            <Animated.View
                style={[styles.container, { transform: [{ translateY: panY }] }]}
                {...panResponder.panHandlers}
            >
                {isMediaLoading && (
                    <View style={styles.loaderContainer}>
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
                    ) : (
                        <Image
                            key={currentStory.id}
                            source={{ uri: resolvedStoryUri ?? undefined, cache: "force-cache" }}
                            style={styles.storyMedia}
                            resizeMode="cover"
                            fadeDuration={0}
                            onLoad={handleMediaReady}
                        />
                    )}

                    <View style={styles.touchOverlay}>
                        <Pressable style={styles.touchLeft} onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={handleTapLeft} />
                        <Pressable style={styles.touchRight} onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={handleTapRight} />
                    </View>
                </View>

                <View
                    style={[styles.uiOverlay, { paddingTop: topSafePadding }, isHolding && styles.hiddenUI]}
                    pointerEvents="box-none"
                >
                    <View style={styles.topSection}>
                        <View style={styles.progressContainer}>
                            {localStories.map((story, index) => {
                                let barWidth: any = "0%";
                                if (index < currentStoryIdx) {
                                    barWidth = "100%";
                                } else if (index === currentStoryIdx) {
                                    barWidth = progressAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: ["0%", "100%"],
                                    });
                                }

                                return (
                                    <View key={story.id} style={styles.progressBarBackground}>
                                        <Animated.View style={[styles.progressBarFill, { width: barWidth }]} />
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
                                    onPress={() => openViewsSheet(pauseTimerForSheet)}
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

                                    onFocus={() => pauseTimerForSheet()}
                                    onBlur={() => resumeTimerFromSheet()}

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
                        <Pressable style={styles.backdrop} onPress={() => closeViewsSheet(resumeTimerFromSheet)} />

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