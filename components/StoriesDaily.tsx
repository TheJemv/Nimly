import { ESTILOS_DICEBEAR } from "@/constants/dicebear";
import { Colors } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { createAvatar } from "@dicebear/core";
import React, { useEffect, useMemo, useState } from "react";
import {
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SvgXml } from "react-native-svg";

import NymlyCamera from "@/components/NymlyCamera";
import StoryViewerModal from "./StoryViewerModal";

export interface StoryGroup {
    user_id: string;
    username: string;
    avatar_url: string | null;
    avatar_config?: any;
    is_me: boolean;
    stories: {
        id: string;
        media_url: string;
        media_type: "image" | "video";
        created_at: string;
        is_seen_by_me: boolean;
        is_view_once: boolean;
        views_count?: number;
        viewers?: any[];
    }[];
}

interface StoriesDailyProps {
    storyGroups: StoryGroup[];
    currentUserId: string | null;
    onStorySeen: (storyId: string, userId: string) => void;
    onStoryLiked?: (storyId: string, userId: string, newLikedState: boolean) => void; // 👈
    onStoryDeleted?: (storyId: string, userId: string) => void; // 👈
    onSendStory: (uri: string, mediaType: "image" | "video") => Promise<void>;
}

function StoryAvatar({ group }: { group: StoryGroup }) {
    const avatarSvg = useMemo(() => {
        const config = group.avatar_config;
        if (!config || !config.styleId) return null;
        try {
            const estilo =
                ESTILOS_DICEBEAR.find((e) => e.id === config.styleId) ||
                ESTILOS_DICEBEAR[0];
            return createAvatar(estilo.collection as any, {
                ...config.options,
                radius: 50,
            }).toString();
        } catch (e) {
            return null;
        }
    }, [group.avatar_config]);

    if (avatarSvg) {
        return <SvgXml xml={avatarSvg} width="100%" height="100%" />;
    }

    return (
        <Image
            source={{
                uri:
                    group.avatar_url ||
                    "https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png",
            }}
            style={styles.avatar}
        />
    );
}

export default function StoriesDaily({
    storyGroups,
    currentUserId,
    onStorySeen,
    onStoryLiked,      // 👈
    onStoryDeleted,    // 👈
    onSendStory,
}: StoriesDailyProps) {
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [myProfileConfig, setMyProfileConfig] = useState<any>(null);

    // 🔍 Consultamos el perfil del propio usuario para inyectar su avatar_config en "Tu historia"
    useEffect(() => {
        const fetchMyProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data } = await supabase
                .from('profiles')
                .select('avatar_config, avatar_url')
                .eq('id', user.id)
                .single();
            if (data) {
                setMyProfileConfig(data);
            }
        };
        fetchMyProfile();
    }, []);

    const sortedStories = useMemo(() => {
        if (selectedUserId !== null) {
            return storyGroups;
        }

        let myGroup = storyGroups.find((item) => item.is_me || item.user_id === currentUserId);

        if (myGroup) {
            myGroup = {
                ...myGroup,
                username: "Tu historia",
                is_me: true,
                avatar_config: myGroup.avatar_config || myProfileConfig?.avatar_config,
                avatar_url: myGroup.avatar_url || myProfileConfig?.avatar_url,
            };
        } else {
            myGroup = {
                user_id: currentUserId || "me",
                username: "Tu historia",
                avatar_url: myProfileConfig?.avatar_url || null,
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
    }, [storyGroups, selectedUserId, currentUserId, myProfileConfig]);

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
                                    <StoryAvatar group={group} />
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

const styles = StyleSheet.create({
    container: {
        backgroundColor: "transparent",
        paddingVertical: 12,
        borderBottomWidth: 0,
        borderBottomColor: Colors.dark.glassBorder,
        minHeight: 110,
    },
    scrollContent: { paddingHorizontal: 16, gap: 14 },
    storyCard: { alignItems: "center", width: 64 },
    avatarRing: { padding: 2, borderRadius: 999, borderWidth: 2 },
    avatarInner: {
        width: 56,
        height: 56,
        borderRadius: 28,
        overflow: "hidden",
        backgroundColor: Colors.dark.surface,
    },
    ringUnseen: { borderColor: Colors.dark.tint },
    ringSeen: { borderColor: Colors.dark.icon },
    ringUser: { borderColor: Colors.dark.textSecondary, borderStyle: "dashed" },
    avatar: {
        width: "100%",
        height: "100%",
    },
    addButton: {
        position: "absolute",
        bottom: 0,
        right: 0,
        backgroundColor: Colors.dark.tint,
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: Colors.dark.background,
        zIndex: 10,
    },
    addIcon: { color: Colors.dark.text, fontWeight: "bold", fontSize: 13 },
    usernameText: {
        color: Colors.dark.textSecondary,
        fontSize: 12,
        marginTop: 6,
        textAlign: "center",
    },
});