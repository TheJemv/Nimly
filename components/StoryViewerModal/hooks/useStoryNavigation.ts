import { Story, StoryGroup } from "@/types/types";
import { useEffect, useState } from "react";

interface UseStoryNavigationProps {
    storyGroups: StoryGroup[];
    initialUserId: string | null;
    visible: boolean;
    onAllStoriesFinished: () => void;
}

export function useStoryNavigation({
    storyGroups,
    initialUserId,
    visible,
    onAllStoriesFinished,
}: UseStoryNavigationProps) {
    const [currentUserIdx, setCurrentUserIdx] = useState(0);
    const [currentStoryIdx, setCurrentStoryIdx] = useState(0);
    const [localStories, setLocalStories] = useState<Story[]>([]);

    const currentGroup = storyGroups[currentUserIdx];
    const currentStory = localStories[currentStoryIdx] || currentGroup?.stories[currentStoryIdx];
    const isVideo = currentStory?.media_type === "video";

    // Sincronizar historias locales cuando cambia el grupo o usuario
    useEffect(() => {
        if (currentGroup) setLocalStories(currentGroup.stories || []);
    }, [currentUserIdx, storyGroups]);

    // Posicionar en el usuario/historia inicial al abrir el modal
    useEffect(() => {
        if (visible && initialUserId) {
            const foundIdx = storyGroups.findIndex((g) => g.user_id === initialUserId);
            const startIdx = foundIdx !== -1 ? foundIdx : 0;
            setCurrentUserIdx(startIdx);

            const unseenStoryIdx = storyGroups[startIdx]?.stories.findIndex((s) => !s.is_seen_by_me);
            setCurrentStoryIdx(unseenStoryIdx !== -1 ? unseenStoryIdx : 0);
        }
    }, [visible, initialUserId]);

    const handleNextStory = () => {
        if (!currentGroup) return;

        if (currentStoryIdx < localStories.length - 1) {
            setCurrentStoryIdx((prev) => prev + 1);
        } else if (currentUserIdx < storyGroups.length - 1) {
            setCurrentUserIdx((prev) => prev + 1);
            setCurrentStoryIdx(0);
        } else {
            onAllStoriesFinished();
        }
    };

    const handlePrevStory = () => {
        if (!currentGroup) return;

        if (currentStoryIdx > 0) {
            setCurrentStoryIdx((prev) => prev - 1);
        } else if (currentUserIdx > 0) {
            const prevUserIdx = currentUserIdx - 1;
            setCurrentUserIdx(prevUserIdx);
            const prevGroupStories = storyGroups[prevUserIdx]?.stories || [];
            setCurrentStoryIdx(Math.max(0, prevGroupStories.length - 1));
        }
    };

    return {
        currentUserIdx,
        setCurrentUserIdx,
        currentStoryIdx,
        setCurrentStoryIdx,
        localStories,
        setLocalStories,
        currentGroup,
        currentStory,
        isVideo,
        handleNextStory,
        handlePrevStory,
    };
}