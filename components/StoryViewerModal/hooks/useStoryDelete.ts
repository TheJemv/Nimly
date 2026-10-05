import { storiesApi } from "@/api/stories";
import { Story, StoryGroup } from "@/types/types";
import { useRef } from "react";
import { Alert } from "react-native";

import type { StoryPauseReason } from "./useStoryTimer";

interface UseStoryDeleteProps {
    currentStory: Story | undefined;
    currentGroup: StoryGroup | undefined;
    onStoryDeleted?: (storyId: string, userId: string) => void;
    pause: (reason: StoryPauseReason) => void;
    resume: (reason: StoryPauseReason) => void;
}

/**
 * Asks first, then deletes. Where to go next isn't decided here: once the
 * feed drops the story, the viewer shows whatever takes its place (or closes
 * if it was the last one).
 */
export function useStoryDelete({
    currentStory,
    currentGroup,
    onStoryDeleted,
    pause,
    resume,
}: UseStoryDeleteProps) {
    const isDeletingRef = useRef(false);

    const handleDeleteStory = () => {
        if (!currentStory || !currentGroup || isDeletingRef.current) return;

        const storyId = currentStory.id;
        const userId = currentGroup.user_id;
        pause("delete");

        const doDelete = async () => {
            isDeletingRef.current = true;
            try {
                await storiesApi.deleteStory(storyId);
                onStoryDeleted?.(storyId, userId);
            } catch (err) {
                console.warn("Error deleting story:", err);
                Alert.alert("Error", "Could not delete the story.");
            } finally {
                isDeletingRef.current = false;
                resume("delete");
            }
        };

        Alert.alert(
            "Delete story?",
            "It will be removed for everyone who can see it.",
            [
                { text: "Cancel", style: "cancel", onPress: () => resume("delete") },
                { text: "Delete", style: "destructive", onPress: () => { void doDelete(); } },
            ],
            { cancelable: true, onDismiss: () => resume("delete") },
        );
    };

    return { handleDeleteStory };
}
