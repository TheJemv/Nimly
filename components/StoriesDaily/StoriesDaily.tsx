import { useMemo, useState } from "react";
import {
    ScrollView,
    Text,
    TouchableOpacity,
    View
} from "react-native";

import NymlyCamera from "@/components/NymlyCamera";
import StoryViewerModal from "@/components/StoryViewerModal";
import UserAvatar from "@/components/UserAvatar";

import { useProfile } from "@/context/ProfileContext";
import { StoryGroup } from "@/types/types";

import { styles } from "./StoriesDaily.styles";

interface StoriesDailyProps {
    storyGroups: StoryGroup[];
    currentUserId: string | null;
    onStorySeen: (storyId: string, userId: string) => void;
    onStoryLiked?: (storyId: string, userId: string, newLikedState: boolean) => void; // 👈
    onStoryDeleted?: (storyId: string, userId: string) => void; // 👈
    onSendStory: (uri: string, mediaType: "image" | "video") => Promise<void>;
}


export default function StoriesDaily({
    storyGroups,
    currentUserId,
    onStorySeen,
    onStoryLiked,
    onStoryDeleted,
    onSendStory,
}: StoriesDailyProps) {
    const { profile: myProfileConfig } = useProfile();

    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [isCameraOpen, setIsCameraOpen] = useState(false);

    const sortedStories = useMemo(() => {
        if (selectedUserId !== null) {
            return storyGroups;
        }

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
    }, [storyGroups, selectedUserId, currentUserId, myProfileConfig]); // myProfileConfig ahora viene del context

    const handleAvatarPress = (group: StoryGroup) => {
        if (group.is_me && group.stories.length === 0) {
            setIsCameraOpen(true);
        } else {
            setSelectedUserId(group.user_id);
        }
    };

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
                            onPress={() => handleAvatarPress(group)}
                        >
                            <View style={[styles.avatarRing, ringStyle]}>
                                <View style={styles.avatarInner}>
                                    <UserAvatar avatar_config={group.avatar_config} size={56} />
                                </View>

                                {group.is_me && (
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
                                {group.username}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {selectedUserId && (
                <StoryViewerModal
                    visible={selectedUserId !== null}
                    initialUserId={selectedUserId}
                    storyGroups={sortedStories}
                    onClose={() => setSelectedUserId(null)}
                    onStorySeen={onStorySeen}
                    onStoryLiked={onStoryLiked}     // 👈
                    onStoryDeleted={onStoryDeleted} // 👈
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
