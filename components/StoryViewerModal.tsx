import { storiesApi } from "@/api/stories";
import { Colors, getThemeColor } from "@/constants/theme";
import { useStoryTimer } from "@/hooks/useStoryTimer";
import { Story, StoryGroup } from "@/types/types";
import getTimeAgo from "@/utils/getTimeAgo";
import { SymbolView } from "expo-symbols";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    FlatList,
    Image,
    Modal,
    Platform,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import UserAvatar from "./UserAvatar";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

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

    const [currentUserIdx, setCurrentUserIdx] = useState(0);
    const [currentStoryIdx, setCurrentStoryIdx] = useState(0);
    const [localStories, setLocalStories] = useState<Story[]>([]);

    const [isViewsSheetOpen, setIsViewsSheetOpen] = useState(false);
    const sheetAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

    const currentGroup = storyGroups[currentUserIdx];

    // Sincronizar historias locales cuando cambia el grupo o usuario
    useEffect(() => {
        if (currentGroup) setLocalStories(currentGroup.stories || []);
    }, [currentUserIdx, storyGroups]);

    // Historia actual basada en el estado local inmediato
    const currentStory = localStories[currentStoryIdx] || currentGroup?.stories[currentStoryIdx];
    const isVideo = currentStory?.media_type === "video";

    // 🔍 Verificamos si el usuario actual ya le dio like a esta historia de su lista de likes
    const isLiked = useMemo(() => {
        if (!currentStory || !currentGroup) return false;
        // Buscamos si el usuario actual está en los likes de la historia
        const likes = (currentStory as any).likes || [];
        // O si tiene una propiedad directa
        if (currentStory.is_liked_by_me !== undefined) return currentStory.is_liked_by_me;
        return false;
    }, [currentStory]);

    const videoPlayer = useVideoPlayer(
        isVideo ? currentStory?.media_url : null,
        (player) => {
            player.loop = false;
        }
    );

    const handleNextStory = () => {
        if (!currentGroup) return;

        if (currentStoryIdx < localStories.length - 1) {
            setCurrentStoryIdx((prev) => prev + 1);
        } else if (currentUserIdx < storyGroups.length - 1) {
            const nextUserIdx = currentUserIdx + 1;
            setCurrentUserIdx(nextUserIdx);
            setCurrentStoryIdx(0);
        } else {
            handleClose();
        }
    };

    const handlePrevStory = () => {
        if (!currentGroup) return;

        if (currentStoryIdx > 0) {
            setCurrentStoryIdx((prev) => prev - 1);
        } else if (currentUserIdx > 0) {
            const prevUserIdx = currentUserIdx - 1;
            setCurrentUserIdx(prevUserIdx);
            const prevGroupStories = storyGroups[prevUserIdx]?.stories || [];
            setCurrentStoryIdx(Math.max(0, prevGroupStories.length - 1));
        }
    };

    const handleDeleteStory = async () => {
        if (!currentStory || !currentGroup) return;

        pauseTimerForSheet();
        const storyIdToDelete = currentStory.id;
        const targetUserId = currentGroup.user_id;

        try {
            await storiesApi.deleteStory(storyIdToDelete);

            if (onStoryDeleted) {
                onStoryDeleted(storyIdToDelete, targetUserId);
            }

            const remainingStories = localStories.filter((s) => s.id !== storyIdToDelete);

            if (remainingStories.length === 0) {
                if (currentUserIdx < storyGroups.length - 1) {
                    setCurrentUserIdx((prev) => prev + 1);
                    setCurrentStoryIdx(0);
                    resumeTimerFromSheet();
                } else {
                    handleClose();
                }
            } else {
                setLocalStories(remainingStories);

                if (currentStoryIdx >= remainingStories.length) {
                    setCurrentStoryIdx(remainingStories.length - 1);
                }

                resetTimer();
                resumeTimerFromSheet();
            }
        } catch (err) {
            console.warn("Error al borrar historia:", err);
            resumeTimerFromSheet();
        }
    };

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
                if (onStorySeen) {
                    onStorySeen(currentStory.id, currentGroup.user_id);
                }
                storiesApi.markAsSeen(currentStory.id);
            }
        }
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
        if (visible && initialUserId) {
            const foundIdx = storyGroups.findIndex((g: any) => g.user_id === initialUserId);
            const startIdx = foundIdx !== -1 ? foundIdx : 0;
            setCurrentUserIdx(startIdx);

            const unseenStoryIdx = storyGroups[startIdx]?.stories.findIndex(
                (s: any) => !s.is_seen_by_me
            );
            setCurrentStoryIdx(unseenStoryIdx !== -1 ? unseenStoryIdx : 0);
        }
    }, [visible, initialUserId]);

    useEffect(() => {
        if (!visible || !currentStory || !currentGroup) return;
        resetTimer();
        setIsViewsSheetOpen(false);
        sheetAnim.setValue(SCREEN_HEIGHT);
    }, [currentUserIdx, currentStoryIdx, visible]);

    const openViewsSheet = () => {
        setIsViewsSheetOpen(true);
        pauseTimerForSheet();

        Animated.spring(sheetAnim, {
            toValue: 0,
            useNativeDriver: true,
            damping: 20,
            stiffness: 90,
        }).start();
    };

    const closeViewsSheet = () => {
        Animated.timing(sheetAnim, {
            toValue: SCREEN_HEIGHT,
            duration: 250,
            useNativeDriver: true,
        }).start(() => {
            setIsViewsSheetOpen(false);
            resumeTimerFromSheet();
        });
    };

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
        setIsViewsSheetOpen(false);
        onClose();
    };

    const isLikingRef = useRef(false);
    const toggleLike = async () => {
        if (!currentStory || !currentGroup) return;
        if (isLikingRef.current) return; // 👈 ya hay un toggle en curso, ignorar
        isLikingRef.current = true;

        const currentLikedState = (currentStory as any).is_liked_by_me || false;
        const nextState = !currentLikedState;

        setLocalStories(prev =>
            prev.map(s =>
                s.id === currentStory.id ? { ...s, is_liked_by_me: nextState } : s
            )
        );

        if (onStoryLiked) {
            onStoryLiked(currentStory.id, currentGroup.user_id, nextState);
        }

        try {
            const res = await storiesApi.toggleLike(currentStory.id, "❤️");
            if (res && res.action) {
                const confirmedLiked = res.action === 'liked';
                setLocalStories(prev =>
                    prev.map(s =>
                        s.id === currentStory.id ? { ...s, is_liked_by_me: confirmedLiked } : s
                    )
                );
            }
        } catch (err) {
            console.warn("Error enviando reaccion:", err);
            setLocalStories(prev =>
                prev.map(s =>
                    s.id === currentStory.id ? { ...s, is_liked_by_me: currentLikedState } : s
                )
            );
        } finally {
            isLikingRef.current = false; // 👈 libera el guard pase lo que pase
        }
    };

    if (!visible || !currentGroup || !currentStory) return null;

    const currentLikedStatus = (currentStory as any).is_liked_by_me || false;

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent={false}
            onRequestClose={handleClose}
            statusBarTranslucent
        >
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

            <View style={styles.container}>
                {isMediaLoading && (
                    <View style={styles.loaderContainer}>
                        <ActivityIndicator size="large" color={Colors.dark.tint} />
                    </View>
                )}

                {isVideo ? (
                    <VideoView
                        key={currentStory.id}
                        player={videoPlayer}
                        style={styles.storyMedia}
                        nativeControls={false}
                        contentFit="cover"
                        onReadyToPlay={handleMediaReady}
                    />
                ) : (
                    <Image
                        key={currentStory.id}
                        source={{
                            uri: currentStory.media_url,
                            cache: "force-cache",
                        }}
                        style={styles.storyMedia}
                        resizeMode="cover"
                        fadeDuration={0}
                        onLoad={handleMediaReady}
                    />
                )}

                <View
                    style={[
                        styles.uiOverlay,
                        { paddingTop: topSafePadding },
                        isHolding && styles.hiddenUI,
                    ]}
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
                                        <Animated.View
                                            style={[styles.progressBarFill, { width: barWidth }]}
                                        />
                                    </View>
                                );
                            })}
                        </View>

                        <View style={styles.header}>
                            <View style={styles.userInfo}>
                                <View style={styles.headerAvatarContainer}>
                                    <UserAvatar
                                        avatar_url={currentGroup.avatar_url}
                                        avatar_config={currentGroup.avatar_config}
                                    />
                                </View>
                                <View style={styles.userTextContainer}>
                                    <Text style={styles.headerUsername}>{currentGroup.username}</Text>
                                    <Text style={styles.timeAgoText}>
                                        {getTimeAgo(currentStory.created_at)}
                                    </Text>
                                </View>
                            </View>

                            <TouchableOpacity
                                onPress={handleClose}
                                style={styles.closeButton}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.closeText}>✕</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={[styles.footer, { paddingBottom: 20 }]}>
                        {currentGroup.is_me ? (
                            <View style={styles.myActions}>
                                <TouchableOpacity
                                    style={styles.likeButton}
                                    activeOpacity={0.8}
                                    onPress={openViewsSheet}
                                >
                                    <SymbolView name={"eye"} size={22} tintColor={getThemeColor("tint")} />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={handleDeleteStory}
                                    style={styles.likeButton}
                                    activeOpacity={0.8}
                                >
                                    <SymbolView
                                        name={"trash"}
                                        tintColor={getThemeColor("tint")}
                                        size={22}
                                    />
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.actionsContainer}>
                                <TouchableOpacity
                                    onPress={toggleLike}
                                    style={styles.likeButton}
                                    activeOpacity={0.8}
                                >
                                    <SymbolView
                                        name={currentLikedStatus ? "heart.fill" : "heart"}
                                        tintColor={currentLikedStatus ? getThemeColor("tint") : "#636366"}
                                        size={22}
                                    />
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </View>

                <View style={styles.touchOverlay}>
                    <Pressable
                        style={styles.touchLeft}
                        onPressIn={handlePressIn}
                        onPressOut={handlePressOut}
                        onPress={handleTapLeft}
                    />
                    <Pressable
                        style={styles.touchRight}
                        onPressIn={handlePressIn}
                        onPressOut={handlePressOut}
                        onPress={handleTapRight}
                    />
                </View>

                {isViewsSheetOpen && (
                    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
                        <Pressable style={styles.backdrop} onPress={closeViewsSheet} />

                        <Animated.View
                            style={[
                                styles.sheetContainer,
                                { transform: [{ translateY: sheetAnim }] },
                            ]}
                        >
                            <View style={styles.sheetHandle} />

                            <View style={styles.sheetHeader}>
                                <Text style={styles.sheetTitle}>Espectadores</Text>
                                <Text style={styles.sheetSubTitle}>
                                    {currentStory.views_count || 0} personas vieron tu historia
                                </Text>
                            </View>

                            <FlatList
                                data={sortedViewers}
                                keyExtractor={(item, index) => item.viewer_id || item.user_id ? `${item.viewer_id || item.user_id}-${index}` : `viewer-${index}`}
                                contentContainerStyle={styles.listContent}
                                renderItem={({ item }) => {
                                    const viewerProfile = item.profiles || item;

                                    return (
                                        <View style={styles.viewerRow}>
                                            <View style={styles.viewerLeft}>
                                                <View style={styles.viewerAvatar}>
                                                    <UserAvatar
                                                        avatar_url={viewerProfile.avatar_url}
                                                        avatar_config={viewerProfile.avatar_config}
                                                        size={40}
                                                    />
                                                </View>
                                                <Text style={styles.viewerUsername}>
                                                    @{viewerProfile.username || item.username || "user"}
                                                </Text>
                                            </View>

                                            {item.has_liked && (
                                                <SymbolView name="heart.fill" size={18} tintColor={getThemeColor("tint")} />
                                            )}
                                        </View>
                                    );
                                }}
                                ListEmptyComponent={
                                    <View style={styles.emptyContainer}>
                                        <SymbolView
                                            name="eye.slash"
                                            size={36}
                                            tintColor="rgba(255,255,255,0.3)"
                                        />
                                        <Text style={styles.emptyText}>Aún no hay vistas</Text>
                                    </View>
                                }
                            />
                        </Animated.View>
                    </View>
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.dark.background,
    },
    loaderContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 2,
    },
    storyMedia: {
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
        position: "absolute",
        top: 0,
        left: 0,
    },
    uiOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 10,
        justifyContent: "space-between",
        pointerEvents: "box-none",
    },
    topSection: { width: "100%" },
    hiddenUI: { opacity: 0 },
    progressContainer: {
        flexDirection: "row",
        paddingHorizontal: 12,
        gap: 4,
    },
    progressBarBackground: {
        flex: 1,
        height: 3,
        backgroundColor: "rgba(255, 255, 255, 0.35)",
        borderRadius: 2,
        overflow: "hidden",
    },
    progressBarFill: {
        height: "100%",
        backgroundColor: Colors.dark.text,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        marginTop: 10,
    },
    userInfo: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    headerAvatarContainer: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1.5,
        borderColor: Colors.dark.tint,
        backgroundColor: Colors.dark.surface,
        overflow: "hidden",
    },
    avatarImg: { width: "100%", height: "100%" },
    headerUsername: {
        color: Colors.dark.text,
        fontWeight: "bold",
        fontSize: 14,
        textShadowColor: "rgba(0,0,0,0.8)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        alignItems: "center",
        justifyContent: "center",
    },
    closeText: {
        color: Colors.dark.text,
        fontSize: 16,
        fontWeight: "bold",
    },
    touchOverlay: {
        ...StyleSheet.absoluteFillObject,
        flexDirection: "row",
        zIndex: 5,
    },
    touchLeft: { width: "30%", height: "100%" },
    touchRight: { width: "70%", height: "100%" },
    footer: { paddingHorizontal: 20, marginBottom: 20 },
    actionsContainer: { alignItems: "flex-end" },
    likeButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "rgba(0,0,0,0.5)",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.2)",
        flexDirection: "row",
        gap: 4,
    },
    viewsBadge: {
        color: "#FFF",
        fontSize: 11,
        fontWeight: "bold",
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.6)",
        zIndex: 20,
    },
    sheetContainer: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: SCREEN_HEIGHT * 0.55,
        backgroundColor: "#121212",
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        zIndex: 30,
        paddingTop: 12,
        borderTopWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
    },
    sheetHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: "rgba(255,255,255,0.3)",
        alignSelf: "center",
        marginBottom: 12,
    },
    sheetHeader: {
        paddingHorizontal: 20,
        paddingBottom: 15,
        borderBottomWidth: 0.5,
        borderBottomColor: "rgba(255,255,255,0.1)",
    },
    sheetTitle: { color: "#FFF", fontSize: 18, fontWeight: "700" },
    sheetSubTitle: { color: "#8E8E93", fontSize: 12, marginTop: 2 },
    listContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 },
    viewerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 12,
    },
    viewerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    viewerAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        overflow: "hidden",
        backgroundColor: "#2C2C2E",
    },
    viewerUsername: { color: "#FFF", fontSize: 15, fontWeight: "600" },
    emptyContainer: { alignItems: "center", marginTop: 40, gap: 8 },
    emptyText: { color: "#8E8E93", fontSize: 14 },
    userTextContainer: {
        flexDirection: "column",
    },
    timeAgoText: {
        color: "rgba(255, 255, 255, 0.7)",
        fontSize: 11,
        fontWeight: "400",
        textShadowColor: "rgba(0,0,0,0.8)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    myActions: {
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between"
    }
});