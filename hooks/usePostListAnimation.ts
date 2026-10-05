import { useEffect, useMemo, useRef } from "react";
import { FadeInDown, FadeOut, LinearTransition } from "react-native-reanimated";

// Shared by every list that shows posts (Home feed, own profile): a post that
// is created or deleted glides in/out instead of making the rest of the list jump.
export const POST_LAYOUT = LinearTransition.duration(300);
export const POST_ENTERING = FadeInDown.duration(380);
export const POST_EXITING = FadeOut.duration(220);

/**
 * Ids that weren't in the list last time. Only a post that really *arrived*
 * (just uploaded, restored after a failed delete, pulled in by a refresh) gets
 * the entering animation — not every row as the list first fills or scrolls in.
 */
export function useFreshPostIds(posts: { id: string }[]): ReadonlySet<string> {
    const knownRef = useRef<Set<string> | null>(null);

    // Computed during render: `entering` is only read when the row mounts.
    const fresh = useMemo(() => {
        const next = new Set<string>();
        const known = knownRef.current;
        if (known) for (const post of posts) if (!known.has(post.id)) next.add(post.id);
        return next;
    }, [posts]);

    useEffect(() => {
        if (posts.length > 0) knownRef.current = new Set(posts.map((post) => post.id));
    }, [posts]);

    return fresh;
}
