import { useMemo, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    Text,
    TouchableOpacity,
    View
} from "react-native";

import { getThemeColor } from "@/constants/theme";

import NymlyCamera from "@/components/NymlyCamera";
import StoryViewerModal from "@/components/StoryViewerModal";
import UserAvatar from "@/components/UserAvatar";

import { useProfile } from "@/context/ProfileContext";
import { StoryGroup } from "@/types/types";

import { styles } from "./StoriesDaily.styles";

// No friend has a story: placeholder slots so the tray doesn't look broken.
// Static and fading out on purpose — a pulsing skeleton would read as "loading".
const PLACEHOLDER_OPACITY = [0.9, 0.65, 0.45, 0.28, 0.15];

interface StoriesDailyProps {
    storyGroups: StoryGroup[];
    currentUserId: string | null;
    onStorySeen: (storyId: string, userId: string) => void;
    onStoryLiked?: (storyId: string, userId: string, newLikedState: boolean) => void;
    onStoryDeleted?: (storyId: string, userId: string) => void;
    onSendStory: (uri: string, mediaType: "image" | "video") => Promise<void>;
    /** true mientras se sube una historia propia: muestra un spinner en el ring. */
    uploadingStory?: boolean;
}


export default function StoriesDaily({
    storyGroups,
    currentUserId,
    onStorySeen,
    onStoryLiked,
    onStoryDeleted,
    onSendStory,
    uploadingStory = false,
}: StoriesDailyProps) {
    const { profile: myProfileConfig } = useProfile();

    // Open viewer: who was tapped + the order to play, frozen at open time so
    // stories turning "seen" don't reshuffle the sequence mid-viewing.
    const [viewer, setViewer] = useState<{ initialUserId: string; order: string[] } | null>(null);
    const [isCameraOpen, setIsCameraOpen] = useState(false);

    const sortedStories = useMemo(() => {
        let myGroup = storyGroups.find((item) => item.is_me || item.user_id === currentUserId);
        if (myGroup) {
            myGroup = {
                ...myGroup,
                username: "Your story",
                is_me: true,
                avatar_config: myGroup.avatar_config || myProfileConfig?.avatar_config,
            };
        } else {
            myGroup = {
                user_id: currentUserId || "me",
                username: "Your story",
                avatar_config: myProfileConfig?.avatar_config || null,
                is_me: true,
                stories: []
            };
        }

        const friendsGroups = storyGroups.filter(
            (item) => !item.is_me && item.user_id !== currentUserId && item.stories.length > 0
        );

        const getLatestStoryTime = (group: StoryGroup) => {
            if (!group.stories || group.stories.length === 0) return 0;
            return Math.max(
                ...group.stories.map((s) => new Date(s.created_at).getTime())
            );
        };

        const hasUnseenStories = (group: StoryGroup) => {
            return group.stories.some((s) => !s.is_seen_by_me);
        };

        friendsGroups.sort((a, b) => {
            const aUnseen = hasUnseenStories(a);
            const bUnseen = hasUnseenStories(b);
            if (aUnseen && !bUnseen) return -1;
            if (!aUnseen && bUnseen) return 1;
            return getLatestStoryTime(b) - getLatestStoryTime(a);
        });

        return [myGroup, ...friendsGroups];
    }, [storyGroups, currentUserId, myProfileConfig]);

    // The viewer plays the tray's order. Your own story plays on its own;
    // a friend's continues through the other friends (unseen first).
    const handleAvatarPress = (group: StoryGroup) => {
        if (group.is_me && group.stories.length === 0) {
            setIsCameraOpen(true);
            return;
        }
        const order = group.is_me
            ? [group.user_id]
            : sortedStories.filter((g) => !g.is_me && g.stories.length > 0).map((g) => g.user_id);
        setViewer({ initialUserId: group.user_id, order });
    };

    // Live data (seen / liked / deleted) in the frozen order.
    const viewerGroups = useMemo(() => {
        if (!viewer) return [];
        const byId = new Map(sortedStories.map((g) => [g.user_id, g]));
        return viewer.order
            .map((id) => byId.get(id))
            .filter((g): g is StoryGroup => !!g && g.stories.length > 0);
    }, [viewer, sortedStories]);

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {sortedStories.map((group) => {
                    const isUnseen = group.stories.some((s) => !s.is_seen_by_me);
                    const hasStories = group.stories.length > 0;
                    const isUploadingHere = group.is_me && uploadingStory;

                    const ringStyle = group.is_me
                        ? hasStories
                            ? isUnseen
                                ? styles.ringUnseen
                                : styles.ringSeen
                            : styles.ringUser
                        : isUnseen
                            ? styles.ringUnseen
                            : styles.ringSeen;

                    return (
                        <TouchableOpacity
                            key={group.user_id}
                            activeOpacity={0.8}
                            style={styles.storyCard}
                            disabled={isUploadingHere}
                            onPress={() => handleAvatarPress(group)}
                        >
                            <View style={[styles.avatarRing, ringStyle]}>
                                <View style={styles.avatarInner}>
                                    <UserAvatar avatar_config={group.avatar_config} size={56} />
                                </View>

                                {isUploadingHere && (
                                    <View style={styles.uploadingOverlay}>
                                        <ActivityIndicator size="small" color={getThemeColor("tint")} />
                                    </View>
                                )}

                                {group.is_me && !isUploadingHere && (
                                    <TouchableOpacity
                                        style={styles.addButton}
                                        activeOpacity={0.8}
                                        onPress={() => setIsCameraOpen(true)}
                                    >
                                        <Text style={styles.addIcon}>+</Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            <Text style={styles.usernameText} numberOfLines={1}>
                                {isUploadingHere ? "Uploading…" : group.username}
                            </Text>
                        </TouchableOpacity>
                    );
                })}

                {sortedStories.length === 1 && PLACEHOLDER_OPACITY.map((opacity, i) => (
                    <View key={i} style={[styles.storyCard, { opacity }]} pointerEvents="none">
                        <View style={styles.placeholderAvatar} />
                        <View style={styles.placeholderName} />
                    </View>
                ))}
            </ScrollView>

            {viewer && (
                <StoryViewerModal
                    visible
                    initialUserId={viewer.initialUserId}
                    storyGroups={viewerGroups}
                    onClose={() => setViewer(null)}
                    onStorySeen={onStorySeen}
                    onStoryLiked={onStoryLiked}
                    onStoryDeleted={onStoryDeleted}
                />
            )}

            <NymlyCamera
                visible={isCameraOpen}
                mode="story"
                onClose={() => setIsCameraOpen(false)}
                onSend={onSendStory}
            />
        </View>
    );
}
