import { storiesApi } from "@/api/stories";
import { Colors, getThemeColor } from "@/constants/theme";
import { StoryGroup, ViewerProfile } from "@/types/types";
import getTimeAgo from "@/utils/getTimeAgo";
import { SymbolView } from "expo-symbols";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useMemo } from "react";
import {
    ActivityIndicator,
    Animated,
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
import UserAvatar from "../UserAvatar";
import { styles } from "./StoryViewerModal.styles";

import { useStoryDelete, useStoryLike, useStoryNavigation, useStoryTimer, useViewsSheet } from "./hooks";

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

    // Reiniciar timer y sheet de espectadores al cambiar de historia/usuario
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

                <View
                    style={[styles.uiOverlay, { paddingTop: topSafePadding }, isHolding && styles.hiddenUI]}
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
                                        avatar_url={currentGroup.avatar_url}
                                        avatar_config={currentGroup.avatar_config}
                                        size={28}
                                    />
                                </View>
                                <View style={styles.userTextContainer}>
                                    <Text style={styles.headerUsername}>{currentGroup.username}</Text>
                                    <Text style={styles.timeAgoText}>{getTimeAgo(currentStory.created_at)}</Text>
                                </View>
                            </View>

                            <TouchableOpacity onPress={handleClose} style={styles.closeButton} activeOpacity={0.7}>
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
                                    onPress={() => openViewsSheet(pauseTimerForSheet)}
                                >
                                    <SymbolView name={"eye"} size={22} tintColor={getThemeColor("tint")} />
                                </TouchableOpacity>

                                <TouchableOpacity onPress={handleDeleteStory} style={styles.likeButton} activeOpacity={0.8}>
                                    <SymbolView name={"trash"} tintColor={getThemeColor("tint")} size={22} />
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.actionsContainer}>
                                <TouchableOpacity onPress={toggleLike} style={styles.likeButton} activeOpacity={0.8}>
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
                    <Pressable style={styles.touchLeft} onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={handleTapLeft} />
                    <Pressable style={styles.touchRight} onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={handleTapRight} />
                </View>

                {isViewsSheetOpen && (
                    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
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
                                                <UserAvatar avatar_url={item.avatar_url} avatar_config={item.avatar_config} size={40} />
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
            </View>
        </Modal>
    );
}