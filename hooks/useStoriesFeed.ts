import { storiesApi, Story } from "@/api/stories";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { StoryGroup, ViewerProfile } from "@/types/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";


export function useStoriesFeed() {
    const { session } = useAuth()

    const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
    const [loadingStories, setLoadingStories] = useState(true);
    // true while a story of your own is being compressed + uploaded + registered.
    // The "Your story" ring shows a spinner on top until it finishes.
    const [uploadingStory, setUploadingStory] = useState(false);

    const channelRef = useRef<any>(null);

    const formatStoriesToGroups = (rawStories: Story[], userId: string | null): StoryGroup[] => {
        const groupsMap: { [key: string]: StoryGroup } = {};

        const sortedRaw = [...rawStories].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        sortedRaw.forEach((story) => {
            const profile = story.profiles;
            if (!profile) return;

            const uId = story.user_id;
            const isMe = uId === userId;

            if (!groupsMap[uId]) {
                groupsMap[uId] = {
                    user_id: uId,
                    username: profile.username || "User",
                    avatar_config: profile.avatar_config,
                    is_me: isMe,
                    stories: [],
                };
            }

            const views = story.story_views || [];
            const likes = story.story_likes || [];
            const likedUserIds = new Set(likes.map((l: any) => l.user_id));

            const isSeenByMe = isMe || views.some((v) => v.viewer_id === userId);

            const viewersWithLikeInfo: ViewerProfile[] = views.map((v: any) => ({
                user_id: v.viewer_id,
                username: v.profiles?.username || "user",
                avatar_url: v.profiles?.avatar_url || null,
                avatar_config: v.profiles?.avatar_config,
                has_liked: likedUserIds.has(v.viewer_id),
                reaction: likes.find((l: any) => l.user_id === v.viewer_id)?.reaction,
                viewed_at: v.viewed_at,
            }));

            groupsMap[uId].stories.push({
                id: story.id,
                user_id: uId, // 👈 This line was missing to satisfy the Story interface!
                media_url: story.media_url,
                // Bare path -> the viewer resolves it via the disk cache.
                media_path: (story as any).media_path ?? story.media_url,
                media_type: story.media_type,
                created_at: story.created_at,
                // HLS streaming: the StoryViewer decides HLS vs MP4 using this.
                playback_status: (story as any).playback_status,
                hls_path: (story as any).hls_path,
                is_seen_by_me: isSeenByMe,
                is_view_once: story.is_view_once,
                views_count: views.length,
                viewers: viewersWithLikeInfo,
                likes,
                is_liked_by_me: (story as any).is_liked_by_me || false,
            });
        });

        return Object.values(groupsMap);
    };

    const reloadStories = useCallback(async (showLoading = true) => {
        const userId = session?.user?.id;
        if (!userId) return; // 👈 no session, nothing to load

        try {
            if (showLoading) setLoadingStories(true);

            const rawStories = await storiesApi.getActiveFeed(session?.user);
            const groups = formatStoriesToGroups(rawStories as Story[], userId);
            setStoryGroups(groups);
        } catch (error) {
            console.error("Error loading stories:", error);
        } finally {
            if (showLoading) setLoadingStories(false);
        }
    }, [session?.user?.id]);

    useEffect(() => {
        let isMounted = true;
        let retryTimeout: ReturnType<typeof setTimeout> | null = null;
        let retryCount = 0;
        let isIntentionalClose = false; // 👈 new flag
        const MAX_RETRY_DELAY = 15000;

        const initRealtime = async () => {
            const user = session?.user
            if (!user || !isMounted) return;

            await reloadStories(true);

            if (channelRef.current) {
                isIntentionalClose = true; // 👈 flag it BEFORE removing
                supabase.removeChannel(channelRef.current);
            }

            const uniqueChannelName = `stories_feed_v2_${user.id}-${Date.now()}`;

            const channel = supabase.channel(uniqueChannelName)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' },
                    (payload) => { if (isMounted) reloadStories(false); })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'story_views' },
                    (payload) => { if (isMounted) reloadStories(false); })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'story_likes' },
                    (payload) => { if (isMounted) reloadStories(false); })
                .subscribe((status, err) => {
                    if (__DEV__) console.log('Stories channel status:', status, err);

                    if (status === 'SUBSCRIBED') {
                        retryCount = 0;
                        isIntentionalClose = false; // 👈 reset once successfully connected
                        return;
                    }

                    if (status === 'CLOSED' && isIntentionalClose) {
                        // 👈 this close was caused by us removing the old channel — ignore
                        isIntentionalClose = false;
                        return;
                    }

                    if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
                        if (!isMounted) return;
                        retryCount++;
                        const delay = Math.min(1000 * 2 ** retryCount, MAX_RETRY_DELAY);
                        if (__DEV__) console.log(`Stories channel down (${status}). Retrying in ${delay}ms...`);

                        if (retryTimeout) clearTimeout(retryTimeout);
                        retryTimeout = setTimeout(() => {
                            if (isMounted) initRealtime();
                        }, delay);
                    }
                });

            channelRef.current = channel;
        };

        initRealtime();

        return () => {
            isMounted = false;
            if (retryTimeout) clearTimeout(retryTimeout);
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }
        };
    }, [reloadStories]);


    const handleStorySeen = async (storyId: string) => {
        try {
            await storiesApi.markAsSeen(storyId);
            setStoryGroups(prev =>
                prev.map(group => ({
                    ...group,
                    stories: group.stories.map(s =>
                        s.id === storyId ? { ...s, is_seen_by_me: true } : s
                    )
                }))
            );
        } catch (e) {
            console.error("Error marking story as seen:", e);
        }
    };

    const handleStoryLiked = async (storyId: string, reaction: string = '❤️') => {
        try {
            await storiesApi.toggleLike(storyId, reaction);
            reloadStories(false);
        } catch (e) {
            console.error("Error liking the story:", e);
        }
    };

    const handleSendStory = async (uri: string, mediaType: "image" | "video") => {
        setUploadingStory(true);
        try {
            await storiesApi.createStory(uri, mediaType, false);
            await reloadStories(false);
        } catch (error) {
            console.error("Error publishing story:", error);
            Alert.alert("Error", "Could not publish the story.");
        } finally {
            setUploadingStory(false);
        }
    };

    const handleStoryDeleted = async (storyId: string) => {
        try {
            await storiesApi.deleteStory(storyId);
            setStoryGroups(prev =>
                prev.map(group => ({
                    ...group,
                    stories: group.stories.filter(s => s.id !== storyId)
                })).filter(group => group.stories.length > 0 || group.is_me)
            );
        } catch (error) {
            console.error("Error deleting story:", error);
            Alert.alert("Error", "Could not delete the story.");
        }
    };

    return {
        storyGroups,
        loadingStories,
        uploadingStory,
        currentUserId: session?.user?.id ?? null,
        reloadStories,
        handleStorySeen,
        handleStoryLiked,
        handleSendStory,
        handleStoryDeleted,
    };
}