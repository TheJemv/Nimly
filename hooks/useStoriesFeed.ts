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

    // What this device already knows but a reload may not reflect yet: a
    // reload that left before our view/like/delete landed would otherwise
    // bring back the old state (unseen ring, wrong heart, deleted story).
    const seenLocallyRef = useRef<Set<string>>(new Set());
    const likeOverridesRef = useRef<Map<string, boolean>>(new Map());
    const deletedLocallyRef = useRef<Set<string>>(new Set());
    // Only the newest reload may write: realtime fires them back to back and
    // an older response arriving last would roll the feed back.
    const reloadSeqRef = useRef(0);

    const formatStoriesToGroups = (rawStories: Story[], userId: string | null): StoryGroup[] => {
        const groupsMap: { [key: string]: StoryGroup } = {};

        const sortedRaw = [...rawStories].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        sortedRaw.forEach((story) => {
            const profile = story.profiles;
            if (!profile) return;
            if (deletedLocallyRef.current.has(story.id)) return;

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

            const isSeenByMe = isMe || seenLocallyRef.current.has(story.id) || views.some((v) => v.viewer_id === userId);

            // A pending like wins until the server shows the same value.
            const serverLiked = (story as any).is_liked_by_me || false;
            const likeOverride = likeOverridesRef.current.get(story.id);
            if (likeOverride === serverLiked) likeOverridesRef.current.delete(story.id);

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
                is_liked_by_me: likeOverride ?? serverLiked,
            });
        });

        return Object.values(groupsMap);
    };

    const reloadStories = useCallback(async (showLoading = true) => {
        const userId = session?.user?.id;
        if (!userId) return; // 👈 no session, nothing to load

        const seq = ++reloadSeqRef.current;
        try {
            if (showLoading) setLoadingStories(true);

            const rawStories = await storiesApi.getActiveFeed(session?.user);
            if (seq !== reloadSeqRef.current) return; // a newer reload is on its way
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

        // Realtime fires for every view/like of every story: coalesce a burst
        // into a single refetch instead of one full reload per event.
        let reloadTimeout: ReturnType<typeof setTimeout> | null = null;
        const scheduleReload = () => {
            if (!isMounted) return;
            if (reloadTimeout) clearTimeout(reloadTimeout);
            reloadTimeout = setTimeout(() => {
                reloadTimeout = null;
                if (isMounted) reloadStories(false);
            }, 500);
        };
        // Our own views are already applied locally (handleStorySeen): reloading
        // the whole feed for each story we watch is pure waste.
        const isOwnView = (payload: any) => {
            const row = payload?.new && Object.keys(payload.new).length > 0 ? payload.new : payload?.old;
            return !!row && row.viewer_id === session?.user?.id;
        };

        const initRealtime = async (showLoading: boolean) => {
            const user = session?.user
            if (!user || !isMounted) return;

            // Spinner only on the first load: a reconnect (e.g. the socket died in
            // the background) refreshes silently — the spinner unmounts the whole feed.
            await reloadStories(showLoading);

            if (channelRef.current) {
                isIntentionalClose = true; // 👈 flag it BEFORE removing
                supabase.removeChannel(channelRef.current);
            }

            const uniqueChannelName = `stories_feed_v2_${user.id}-${Date.now()}`;

            const channel = supabase.channel(uniqueChannelName)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' },
                    () => scheduleReload())
                .on('postgres_changes', { event: '*', schema: 'public', table: 'story_views' },
                    (payload) => { if (!isOwnView(payload)) scheduleReload(); })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'story_likes' },
                    () => scheduleReload())
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
                            if (isMounted) initRealtime(false);
                        }, delay);
                    }
                });

            channelRef.current = channel;
        };

        initRealtime(true);

        return () => {
            isMounted = false;
            if (retryTimeout) clearTimeout(retryTimeout);
            if (reloadTimeout) clearTimeout(reloadTimeout);
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }
        };
    }, [reloadStories]);


    // The viewer already did the network call for these three (markAsSeen,
    // toggleLike, deleteStory): here we only reflect it in the feed, right away.
    const handleStorySeen = (storyId: string) => {
        seenLocallyRef.current.add(storyId);
        setStoryGroups(prev =>
            prev.map(group => ({
                ...group,
                stories: group.stories.map(s =>
                    s.id === storyId ? { ...s, is_seen_by_me: true } : s
                )
            }))
        );
    };

    const handleStoryLiked = (storyId: string, _userId: string, liked: boolean) => {
        likeOverridesRef.current.set(storyId, liked);
        setStoryGroups(prev =>
            prev.map(group => ({
                ...group,
                stories: group.stories.map(s =>
                    s.id === storyId ? { ...s, is_liked_by_me: liked } : s
                )
            }))
        );
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

    const handleStoryDeleted = (storyId: string) => {
        deletedLocallyRef.current.add(storyId);
        setStoryGroups(prev =>
            prev.map(group => ({
                ...group,
                stories: group.stories.filter(s => s.id !== storyId)
            })).filter(group => group.stories.length > 0 || group.is_me)
        );
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