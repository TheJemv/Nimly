import { storiesApi } from "@/api/stories";
import { Story, StoryGroup } from "@/types/types";
import { useRef } from "react";

interface UseStoryLikeProps {
    currentStory: Story | undefined;
    currentGroup: StoryGroup | undefined;
    onStoryLiked?: (storyId: string, userId: string, newLikedState: boolean) => void;
}

/**
 * The like lives in the feed state (`onStoryLiked` updates it right away);
 * this does the ONE network call and corrects the feed with what the server
 * confirms, or rolls it back if the call fails.
 */
export function useStoryLike({
    currentStory,
    currentGroup,
    onStoryLiked,
}: UseStoryLikeProps) {
    const isLikingRef = useRef(false);

    const toggleLike = async () => {
        if (!currentStory || !currentGroup) return;
        if (isLikingRef.current) return;
        isLikingRef.current = true;

        const storyId = currentStory.id;
        const userId = currentGroup.user_id;
        const wasLiked = currentStory.is_liked_by_me || false;

        onStoryLiked?.(storyId, userId, !wasLiked);

        try {
            const res = await storiesApi.toggleLike(storyId, "❤️");
            if (res?.action) onStoryLiked?.(storyId, userId, res.action === "liked");
        } catch (err) {
            console.warn("Error sending reaction:", err);
            onStoryLiked?.(storyId, userId, wasLiked);
        } finally {
            isLikingRef.current = false;
        }
    };

    return { toggleLike };
}
