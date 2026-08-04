import { storiesApi, Story } from "@/api/stories";
import { StoryGroup, ViewerProfile } from "@/components/StoriesDaily";
import { supabase } from "@/lib/supabase";
import { useCallback, useEffect, useState } from "react";
import { Image } from "react-native";

export function useStoriesFeed() {
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  const [loadingStories, setLoadingStories] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const loadStories = useCallback(async (showLoading = true) => {
    if (showLoading) setLoadingStories(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const rawStories = (await storiesApi.getActiveFeed()) as Story[];
      const groupsMap: { [key: string]: StoryGroup } = {};

      // Obtener mi perfil
      const myProfileResponse = await supabase
        .from("profiles")
        .select("id, username, avatar_url, avatar_config")
        .eq("id", user.id)
        .single();

      const myProfile = myProfileResponse.data;

      // Inicializar mi grupo siempre presente
      groupsMap[user.id] = {
        user_id: user.id,
        username: "Tu historia",
        avatar_url: myProfile?.avatar_url || null,
        avatar_config: myProfile?.avatar_config || null,
        is_me: true,
        stories: [],
      };

      (rawStories || []).forEach((s: any) => {
        const uId = s.user_id;
        const isMe = uId === user.id;

        if (!groupsMap[uId]) {
          groupsMap[uId] = {
            user_id: uId,
            username: isMe ? "Tu historia" : s.profiles?.username || "Usuario",
            avatar_url: s.profiles?.avatar_url || null,
            avatar_config: s.profiles?.avatar_config || null,
            is_me: isMe,
            stories: [],
          };
        }

        const isSeenByMe = isMe
          ? true
          : (s.story_views || []).some((v: any) => v.viewer_id === user.id);

        const isLikedByMe = (s.story_likes || []).some((l: any) => l.user_id === user.id);
        const likesSet = new Set((s.story_likes || []).map((l: any) => l.user_id));

        const viewersList: ViewerProfile[] = (s.story_views || []).map((v: any) => ({
          user_id: v.viewer_id,
          username: v.profiles?.username || "Usuario",
          avatar_url: v.profiles?.avatar_url || null,
          avatar_config: v.profiles?.avatar_config || null,
          has_liked: likesSet.has(v.viewer_id),
          viewed_at: v.viewed_at,
        }));

        // 🚀 PRELOAD INSTANTÁNEO EN MEMORIA DE LA IMAGEN (ESPECIALMENTE MI HISTORIA)
        if (s.media_type !== "video" && s.media_url) {
          Image.prefetch(s.media_url);
        }

        groupsMap[uId].stories.push({
          id: s.id,
          media_url: s.media_url,
          media_type: s.media_type,
          created_at: s.created_at,
          is_seen_by_me: isSeenByMe,
          is_liked_by_me: isLikedByMe,
          is_view_once: s.is_view_once,
          views_count: s.story_views ? s.story_views.length : 0,
          viewers: viewersList,
        });
      });

      Object.values(groupsMap).forEach((group) => {
        group.stories.sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });

      setStoryGroups(Object.values(groupsMap));
    } catch (error) {
      console.error("Error al cargar historias:", error);
    } finally {
      setLoadingStories(false);
    }
  }, []);

const handleStorySeen = useCallback((storyId: string, userId: string) => {
  setStoryGroups((prev) =>
    prev.map((group) => {
      if (group.user_id === userId) {
        const updatedStories = group.stories.map((s) =>
          s.id === storyId ? { ...s, is_seen_by_me: true } : s
        );

        return {
          ...group,
          stories: updatedStories,
        };
      }
      return group;
    })
  );
}, []);

  const handleStoryLiked = useCallback(
    (storyId: string, userId: string, newLikedState: boolean) => {
      setStoryGroups((prev) =>
        prev.map((group) => {
          if (group.user_id === userId) {
            return {
              ...group,
              stories: group.stories.map((s) =>
                s.id === storyId ? { ...s, is_liked_by_me: newLikedState } : s
              ),
            };
          }
          return group;
        })
      );
    },
    []
  );

  const handleSendStory = useCallback(
    async (uri: string, mediaType: "image" | "video") => {
      try {
        await storiesApi.createStory(uri, mediaType);
        await loadStories(false);
      } catch (err) {
        console.error("Error al publicar historia:", err);
      }
    },
    [loadStories]
  );

  useEffect(() => {
    loadStories();

    const channel = supabase
      .channel("public:stories_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stories" },
        () => loadStories(false)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadStories]);

  const handleStoryDeleted = useCallback((storyId: string, userId: string) => {
    setStoryGroups((prev) =>
      prev
        .map((group) => {
          if (group.user_id === userId) {
            const filteredStories = group.stories.filter((s) => s.id !== storyId);
            return {
              ...group,
              stories: filteredStories,
            };
          }
          return group;
        })
        .filter((group) => group.stories.length > 0) // Si ya no quedan historias, oculta el grupo del feed
    );
  }, []);

  return {
    storyGroups,
    loadingStories,
    currentUserId,
    reloadStories: loadStories,
    handleStorySeen,
    handleStoryLiked,
    handleSendStory,
    handleStoryDeleted,
  };
}