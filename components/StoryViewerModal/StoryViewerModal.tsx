import { storiesApi } from "@/api/stories";
import { Colors, getThemeColor } from "@/constants/theme";
import { StoryGroup, ViewerProfile } from "@/types/types";
import getTimeAgo from "@/utils/getTimeAgo";
import { SymbolView } from "expo-symbols";
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
import { useBlockedUsers } from "@/context/BlockedUsersContext";
import { useAnimatedValue } from "@/utils/animations";
import { promptReportReason } from "@/utils/moderation";
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

    const videoPlayer = useVideoPlayer(
        isVideo ? currentStory?.media_url : null,
        (player) => {
            player.loop = false;
        }
    );

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
        // expo-video puede haber liberado el player nativo (fin de historias /
        // desmontaje): la llamada lanza NotFoundException si no se protege.
        try { if (isVideo && videoPlayer) videoPlayer.pause(); } catch { /* player liberado */ }
        resetSheet();
        onClose();
    };

    const [isReporting, setIsReporting] = useState<boolean>(false)

    const reportedStoryIdsRef = useRef<Set<string>>(new Set());
    const isReportingRef = useRef(false);

    // --- ANIMACIÓN PARA DESLIZAR Y CERRAR ---
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
                        <VideoView
                            key={currentStory.id}
                            player={videoPlayer}
                            style={styles.storyMedia}
                            nativeControls={false}
                            contentFit="cover"
                            onFirstFrameRender={handleMediaReady}
                        />
                    ) : (
                        <Image
                            key={currentStory.id}
                            source={{ uri: currentStory.media_url, cache: "force-cache" }}
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
                            // ScrollView (scroll activo, sólo acotado por maxHeight)
                            // para que keyboardShouldPersistTaps surta efecto: sin
                            // esto el primer tap al botón se lo come el cierre del
                            // teclado. Ver facebook/react-native#28871.
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
                                    // onPressIn (no onPress): fallback extra por si
                                    // el tap se pierde al cerrarse el teclado.
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
                                            tintColor={currentLikedStatus ? getThemeColor("tint") : "#636366"}
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
                                <Text style={styles.sheetTitle}>Espectadores</Text>
                                <Text style={styles.sheetSubTitle}>
                                    {currentStory.views_count || 0} personas vieron tu historia
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
                                        <Text style={styles.emptyText}>Aún no hay vistas</Text>
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