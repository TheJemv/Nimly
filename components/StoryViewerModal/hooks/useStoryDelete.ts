import { storiesApi } from "@/api/stories";
import { Story, StoryGroup } from "@/types/types";
import { Dispatch, SetStateAction } from "react";

interface UseStoryDeleteProps {
    currentStory: Story | undefined;
    currentGroup: StoryGroup | undefined;
    localStories: Story[];
    setLocalStories: Dispatch<SetStateAction<Story[]>>;
    currentStoryIdx: number;
    setCurrentStoryIdx: Dispatch<SetStateAction<number>>;
    currentUserIdx: number;
    setCurrentUserIdx: Dispatch<SetStateAction<number>>;
    totalGroups: number;
    onStoryDeleted?: (storyId: string, userId: string) => void;
    resetTimer: () => void;
    pauseTimer: () => void;
    afterDelete: () => void;
    onLastStoryOfLastGroup: () => void;
}

export function useStoryDelete({
    currentStory,
    currentGroup,
    localStories,
    setLocalStories,
    currentStoryIdx,
    setCurrentStoryIdx,
    currentUserIdx,
    setCurrentUserIdx,
    totalGroups,
    onStoryDeleted,
    resetTimer,
    pauseTimer,
    afterDelete,
    onLastStoryOfLastGroup,
}: UseStoryDeleteProps) {
    const handleDeleteStory = async () => {
        if (!currentStory || !currentGroup) return;
        pauseTimer();

        const storyIdToDelete = currentStory.id;
        const targetUserId = currentGroup.user_id;

        try {
            await storiesApi.deleteStory(storyIdToDelete);
            onStoryDeleted?.(storyIdToDelete, targetUserId);

            const remainingStories = localStories.filter((s) => s.id !== storyIdToDelete);

            if (remainingStories.length === 0) {
                if (currentUserIdx < totalGroups - 1) {
                    setCurrentUserIdx((prev) => prev + 1);
                    setCurrentStoryIdx(0);
                    afterDelete();
                } else {
                    onLastStoryOfLastGroup();
                }
            } else {
                setLocalStories(remainingStories);
                if (currentStoryIdx >= remainingStories.length) {
                    setCurrentStoryIdx(remainingStories.length - 1);
                }
                resetTimer();
                afterDelete();
            }
        } catch (err) {
            console.warn("Error al borrar historia:", err);
            afterDelete();
        }
    };

    return { handleDeleteStory };
}