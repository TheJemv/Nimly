import { storiesApi, Story } from "@/api/stories";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { ViewerProfile } from "@/types/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

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
        likes?: any[];
        is_liked_by_me: boolean;
    }[];
}

export function useStoriesFeed() {
    const { session } = useAuth()

    const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
    const [loadingStories, setLoadingStories] = useState(true);

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
                    avatar_url: profile.avatar_url,
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
                media_url: story.media_url,
                media_type: story.media_type,
                created_at: story.created_at,
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
        if (!userId) return; // 👈 sin sesión, no hay nada que cargar

        const t0 = performance.now();
        try {
            if (showLoading) setLoadingStories(true);

            const tFetchStart = performance.now();
            const rawStories = await storiesApi.getActiveFeed(session?.user);
            const tFetchEnd = performance.now();
            console.log(`⏱️ [Stories] getActiveFeed() (${rawStories.length} historias): ${(tFetchEnd - tFetchStart).toFixed(0)}ms`);

            const groups = formatStoriesToGroups(rawStories as Story[], userId);
            setStoryGroups(groups);

            console.log(`⏱️ [Stories] TOTAL reloadStories(): ${(performance.now() - t0).toFixed(0)}ms`);
        } catch (error) {
            console.error("Error cargando historias:", error);
        } finally {
            if (showLoading) setLoadingStories(false);
        }
    }, [session?.user?.id]);

    useEffect(() => {
        let isMounted = true;
        let retryTimeout: ReturnType<typeof setTimeout> | null = null;
        let retryCount = 0;
        let isIntentionalClose = false; // 👈 nueva bandera
        const MAX_RETRY_DELAY = 15000;

        const initRealtime = async () => {
            const user = session?.user
            if (!user || !isMounted) return;

            await reloadStories(true);

            if (channelRef.current) {
                isIntentionalClose = true; // 👈 marcamos ANTES de remover
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
                    console.log('🔌 Estado del canal de historias:', status, err);

                    if (status === 'SUBSCRIBED') {
                        retryCount = 0;
                        isIntentionalClose = false; // 👈 resetear una vez conectado bien
                        return;
                    }

                    if (status === 'CLOSED' && isIntentionalClose) {
                        // 👈 este cierre lo causamos nosotros al remover el canal viejo — ignorar
                        isIntentionalClose = false;
                        return;
                    }

                    if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
                        if (!isMounted) return;
                        retryCount++;
                        const delay = Math.min(1000 * 2 ** retryCount, MAX_RETRY_DELAY);
                        console.log(`⚠️ Canal de historias caído (${status}). Reintentando en ${delay}ms...`);

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
            console.error("Error al marcar historia como vista:", e);
        }
    };

    const handleStoryLiked = async (storyId: string, reaction: string = '❤️') => {
        try {
            await storiesApi.toggleLike(storyId, reaction);
            reloadStories(false);
        } catch (e) {
            console.error("Error al dar like a la historia:", e);
        }
    };

    const handleSendStory = async (uri: string, mediaType: "image" | "video") => {
        try {
            await storiesApi.createStory(uri, mediaType, false);
            await reloadStories(false);
        } catch (error) {
            console.error("Error publicando historia:", error);
            Alert.alert("Error", "No se pudo publicar la historia.");
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
            console.error("Error eliminando historia:", error);
            Alert.alert("Error", "No se pudo eliminar la historia.");
        }
    };

    return {
        storyGroups,
        loadingStories,
        currentUserId: session?.user?.id ?? null,
        reloadStories,
        handleStorySeen,
        handleStoryLiked,
        handleSendStory,
        handleStoryDeleted,
    };
}