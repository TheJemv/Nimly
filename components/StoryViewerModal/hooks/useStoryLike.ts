// components/StoryViewerModal/useStoryLike.ts
import { storiesApi } from "@/api/stories";
import { Story, StoryGroup } from "@/types/types";
import { useRef } from "react";

interface UseStoryLikeProps {
    currentStory: Story | undefined;
    currentGroup: StoryGroup | undefined;
    setLocalStories: React.Dispatch<React.SetStateAction<Story[]>>;
    onStoryLiked?: (storyId: string, userId: string, newLikedState: boolean) => void;
}

export function useStoryLike({
    currentStory,
    currentGroup,
    setLocalStories,
    onStoryLiked,
}: UseStoryLikeProps) {
    const isLikingRef = useRef(false);

    const toggleLike = async () => {
        if (!currentStory || !currentGroup) return;
        if (isLikingRef.current) return;
        isLikingRef.current = true;

        const currentLikedState = (currentStory as any).is_liked_by_me || false;
        const nextState = !currentLikedState;

        setLocalStories((prev) =>
            prev.map((s) => (s.id === currentStory.id ? { ...s, is_liked_by_me: nextState } : s))
        );

        if (onStoryLiked) {
            onStoryLiked(currentStory.id, currentGroup.user_id, nextState);
        }

        try {
            const res = await storiesApi.toggleLike(currentStory.id, "❤️");
            if (res && res.action) {
                const confirmedLiked = res.action === "liked";
                setLocalStories((prev) =>
                    prev.map((s) => (s.id === currentStory.id ? { ...s, is_liked_by_me: confirmedLiked } : s))
                );
            }
        } catch (err) {
            console.warn("Error enviando reaccion:", err);
            setLocalStories((prev) =>
                prev.map((s) => (s.id === currentStory.id ? { ...s, is_liked_by_me: currentLikedState } : s))
            );
        } finally {
            isLikingRef.current = false;
        }
    };

    return { toggleLike };
}