import { storiesApi } from "@/api/stories";
import { Colors, getThemeColor } from "@/constants/theme";
import { StoryGroup, ViewerProfile } from "@/types/types";
import getTimeAgo from "@/utils/getTimeAgo";
import { SymbolView } from "expo-symbols";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    FlatList,
    Image,
    KeyboardAvoidingView,
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
import UserAvatar from "../UserAvatar";
import { styles } from "./StoryViewerModal.styles";

import { reportsApi } from "@/api/reports";
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
    const topSafePadding =
        insets.top > 0 ? insets.top + 4 : Platform.OS === "ios" ? 50 : 20;

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
        if (isVideo && videoPlayer) videoPlayer.pause();
        resetSheet();
        onClose();
    };

    const [isReporting, setIsReporting] = useState<boolean>(false)

    const reportedStoryIdsRef = useRef<Set<string>>(new Set());
    const isReportingRef = useRef(false);

    // --- ANIMACIÓN PARA DESLIZAR Y CERRAR ---
    const panY = useRef(new Animated.Value(0)).current;

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

    const handleReport = () => {
        if (!currentStory || !currentGroup) return;
        if (reportedStoryIdsRef.current.has(currentStory.id)) return;

        pauseTimerForSheet();

        Alert.alert(
            "Report Story",
            `Are you sure you want to report this story by @${currentGroup.username || 'user'}?`,
            [
                {
                    text: "Cancel",
                    style: "cancel",
                    onPress: () => resumeTimerFromSheet(),
                },
                {
                    text: "Report",
                    style: "destructive",
                    onPress: async () => {
                        if (isReportingRef.current) return;
                        if (reportedStoryIdsRef.current.has(currentStory.id)) return;
                        isReportingRef.current = true;
                        setIsReporting(true);

                        try {
                            await reportsApi.submitReport({
                                targetStoryId: currentStory.id,
                                reason: 'inappropriate_content',
                            }).then((e) => {
                                if (e?.success) {
                                    Alert.alert(
                                        "Story Reported",
                                        "Thank you for reporting. We will review this story shortly."
                                    );
                                }
                            })
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
                            resumeTimerFromSheet();
                        }
                    }
                }
            ]
        );
    };

    if (!visible || !currentGroup || !currentStory) return null;
    const currentLikedStatus = (currentStory as any).is_liked_by_me || false;

    const {
        replyTextStory,
        loadingReplyStory,
        setReplyTextStory,
        handleReplyStory,
    } = useReplyStory(currentGroup, currentStory.id)

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

                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : undefined}
                    keyboardVerticalOffset={Platform.OS === "ios" ? -insets.bottom + 54 : 0}
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
                                <TouchableOpacity onPress={handleReport} style={styles.closeButton} activeOpacity={0.7} disabled={isReporting}>
                                    <SymbolView name={"exclamationmark"} size={16} tintColor={Colors.dark.text} />
                                </TouchableOpacity>

                                <TouchableOpacity onPress={handleClose} style={styles.closeButton} activeOpacity={0.7}>
                                    <SymbolView name={"xmark"} size={16} tintColor={Colors.dark.text} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    <View style={[styles.footer, { paddingBottom: 20 }]}>
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
                            // --- SCROLL VIEW PARA EL TECLADO ---
                            <ScrollView
                                contentContainerStyle={styles.actionsContainer}
                                keyboardShouldPersistTaps="always"
                                scrollEnabled={false}
                                style={{ flexGrow: 0 }}
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
                                    onSubmitEditing={handleReplyStory}
                                />

                                {replyTextStory ? (
                                    <TouchableOpacity disabled={loadingReplyStory} onPress={handleReplyStory} style={styles.likeButton} activeOpacity={0.8}>
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
                </KeyboardAvoidingView>

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
            </Animated.View>
        </Modal>
    );
}