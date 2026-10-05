import { Story, StoryGroup } from "@/types/types";
import { useEffect, useMemo, useRef, useState } from "react";

interface UseStoryNavigationProps {
    storyGroups: StoryGroup[];
    initialUserId: string | null;
    visible: boolean;
    onAllStoriesFinished: () => void;
}

/** Where the viewer is, by id: indexes shift whenever the feed reloads. */
interface Position {
    userId: string;
    storyId: string;
}

interface Slot {
    groupIdx: number;
    storyIdx: number;
}

/** First story not seen yet (0 when they're all seen). */
function firstUnseenIdx(group: StoryGroup): number {
    const idx = group.stories.findIndex((s) => !s.is_seen_by_me);
    return idx === -1 ? 0 : idx;
}

function initialPosition(groups: StoryGroup[], initialUserId: string | null): Position | null {
    const group = groups.find((g) => g.user_id === initialUserId) ?? groups[0];
    const story = group?.stories[firstUnseenIdx(group)];
    return group && story ? { userId: group.user_id, storyId: story.id } : null;
}

/**
 * Maps the position to indexes in the current groups. If the story (deleted,
 * expired) or its whole group (blocked, all expired) is gone, we stay on the
 * same slot and show whatever slid into it; null = nothing left to show.
 */
function resolveSlot(groups: StoryGroup[], position: Position | null, lastSlot: Slot): Slot | null {
    if (!position) return null;

    const groupIdx = groups.findIndex((g) => g.user_id === position.userId);
    if (groupIdx !== -1) {
        const stories = groups[groupIdx].stories;
        const storyIdx = stories.findIndex((s) => s.id === position.storyId);
        if (storyIdx !== -1) return { groupIdx, storyIdx };
        if (stories.length > 0) return { groupIdx, storyIdx: Math.min(lastSlot.storyIdx, stories.length - 1) };
    }

    const from = groupIdx !== -1 ? groupIdx + 1 : lastSlot.groupIdx;
    for (let i = from; i < groups.length; i++) {
        if (groups[i].stories.length > 0) return { groupIdx: i, storyIdx: firstUnseenIdx(groups[i]) };
    }
    return null;
}

export function useStoryNavigation({
    storyGroups,
    initialUserId,
    visible,
    onAllStoriesFinished,
}: UseStoryNavigationProps) {
    // Lazy init: the very first frame is already the right story (no flash of
    // another user's story, no download of media nobody asked for).
    const [position, setPosition] = useState<Position | null>(() => initialPosition(storyGroups, initialUserId));
    // Latest requested position, ahead of the render: taps that arrive in the
    // same event batch each move one story from where the previous one left off.
    const positionRef = useRef(position);
    const lastSlotRef = useRef<Slot>({ groupIdx: 0, storyIdx: 0 });

    const moveTo = (next: Position | null) => {
        positionRef.current = next;
        setPosition(next);
    };

    // Reopened without remounting: start over at the tapped user.
    const wasVisibleRef = useRef(visible);
    useEffect(() => {
        if (visible && !wasVisibleRef.current) moveTo(initialPosition(storyGroups, initialUserId));
        wasVisibleRef.current = visible;
    }, [visible, initialUserId]);

    const slot = useMemo(
        () => resolveSlot(storyGroups, position, lastSlotRef.current),
        [storyGroups, position],
    );

    const currentGroup: StoryGroup | undefined = slot ? storyGroups[slot.groupIdx] : undefined;
    const currentStory: Story | undefined = slot ? currentGroup?.stories[slot.storyIdx] : undefined;
    const currentStoryIdx = slot?.storyIdx ?? 0;
    const isVideo = currentStory?.media_type === "video";

    // Remember the slot and re-anchor the position on what's actually shown.
    useEffect(() => {
        if (!slot || !currentGroup || !currentStory) return;
        lastSlotRef.current = slot;
        if (position?.userId !== currentGroup.user_id || position?.storyId !== currentStory.id) {
            moveTo({ userId: currentGroup.user_id, storyId: currentStory.id });
        }
    }, [slot, currentGroup, currentStory, position]);

    const goTo = (groupIdx: number, storyIdx: number) => {
        const group = storyGroups[groupIdx];
        const story = group?.stories[storyIdx];
        if (group && story) moveTo({ userId: group.user_id, storyId: story.id });
    };

    const latestSlot = () => resolveSlot(storyGroups, positionRef.current, lastSlotRef.current);

    /**
     * `fromStoryId`: the story that asked to move on (its timer / video ended).
     * If you already left it (e.g. tapped right as it ended), it's ignored
     * instead of skipping the story you just landed on.
     */
    const handleNextStory = (fromStoryId?: string) => {
        if (fromStoryId !== undefined && fromStoryId !== positionRef.current?.storyId) return;
        const target = latestSlot();
        if (!target) return;
        const { groupIdx, storyIdx } = target;
        if (storyIdx < storyGroups[groupIdx].stories.length - 1) {
            goTo(groupIdx, storyIdx + 1);
        } else if (groupIdx < storyGroups.length - 1) {
            goTo(groupIdx + 1, firstUnseenIdx(storyGroups[groupIdx + 1]));
        } else {
            onAllStoriesFinished();
        }
    };

    /** false = already on the very first story (the caller restarts it). */
    const handlePrevStory = (): boolean => {
        const target = latestSlot();
        if (!target) return false;
        const { groupIdx, storyIdx } = target;
        if (storyIdx > 0) {
            goTo(groupIdx, storyIdx - 1);
            return true;
        }
        if (groupIdx > 0) {
            goTo(groupIdx - 1, storyGroups[groupIdx - 1].stories.length - 1);
            return true;
        }
        return false;
    };

    // The story that plays after this one, to warm up its media.
    const nextStory: Story | undefined = (() => {
        if (!slot || !currentGroup) return undefined;
        if (slot.storyIdx < currentGroup.stories.length - 1) return currentGroup.stories[slot.storyIdx + 1];
        const nextGroup = storyGroups[slot.groupIdx + 1];
        return nextGroup?.stories[firstUnseenIdx(nextGroup)];
    })();

    return {
        currentGroup,
        currentStory,
        currentStoryIdx,
        nextStory,
        isVideo,
        handleNextStory,
        handlePrevStory,
    };
}
