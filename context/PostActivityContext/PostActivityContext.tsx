import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { createPost, deletePost } from "@/api/posts";

type UploadMedia = { uri: string; type: "image" | "video" };
type PendingPost = { userId: string; text: string; media?: UploadMedia };
type PostToDelete = { id: string };

export type PostActivityStatus = "idle" | "running" | "done" | "error";

interface PostActivityContextValue {
    /** Background upload of a new post (drives the "Uploading…" banner). */
    uploadStatus: PostActivityStatus;
    /** Starts the upload in the background: the caller can leave its screen right away. */
    startUpload: (post: PendingPost) => void;
    /** Re-runs the upload that failed. */
    retryUpload: () => void;
    /** Hides the banner (and drops a failed upload). */
    dismissUpload: () => void;

    /** Background deletion of posts (drives the "Deleting…" banner). */
    deleteStatus: PostActivityStatus;
    /** Posts to hide: they disappear the moment deletion starts and come back if the server refuses. */
    deletedIds: ReadonlySet<string>;
    /** Hides the post right away and deletes it on the server in the background. */
    startDelete: (post: PostToDelete) => void;
    dismissDelete: () => void;

    /** Goes up whenever the server's posts changed (upload done, delete settled) so lists refresh. */
    postsVersion: number;
}

const DONE_VISIBLE_MS = 2200;
const ERROR_VISIBLE_MS = 4000;
const NO_IDS: ReadonlySet<string> = new Set();

type TimerRef = { current: ReturnType<typeof setTimeout> | null };

const clearTimer = (ref: TimerRef) => {
    if (ref.current) clearTimeout(ref.current);
    ref.current = null;
};

const PostActivityContext = createContext<PostActivityContextValue>({
    uploadStatus: "idle",
    startUpload: () => { },
    retryUpload: () => { },
    dismissUpload: () => { },
    deleteStatus: "idle",
    deletedIds: NO_IDS,
    startDelete: () => { },
    dismissDelete: () => { },
    postsVersion: 0,
});

export function PostActivityProvider({ children }: { children: React.ReactNode }) {
    const [uploadStatus, setUploadStatus] = useState<PostActivityStatus>("idle");
    const [deleteStatus, setDeleteStatus] = useState<PostActivityStatus>("idle");
    const [deletedIds, setDeletedIds] = useState<ReadonlySet<string>>(NO_IDS);
    const [postsVersion, setPostsVersion] = useState(0);

    const pendingUploadRef = useRef<PendingPost | null>(null);
    const uploadInFlightRef = useRef(false);
    const uploadTimerRef: TimerRef = useRef(null);

    const deletesInFlightRef = useRef(0);
    const deleteFailedRef = useRef(false);
    const deleteTimerRef: TimerRef = useRef(null);

    useEffect(() => () => {
        clearTimer(uploadTimerRef);
        clearTimer(deleteTimerRef);
    }, []);

    const startUpload = useCallback(async (post: PendingPost) => {
        if (uploadInFlightRef.current) return;
        uploadInFlightRef.current = true;
        pendingUploadRef.current = post;
        clearTimer(uploadTimerRef);
        setUploadStatus("running");
        try {
            await createPost(post.userId, post.text, post.media);
            pendingUploadRef.current = null;
            setPostsVersion((v) => v + 1);
            setUploadStatus("done");
            uploadTimerRef.current = setTimeout(() => setUploadStatus("idle"), DONE_VISIBLE_MS);
        } catch (e) {
            if (__DEV__) console.warn("Post upload failed:", e);
            setUploadStatus("error");
        } finally {
            uploadInFlightRef.current = false;
        }
    }, []);

    const retryUpload = useCallback(() => {
        if (pendingUploadRef.current) startUpload(pendingUploadRef.current);
    }, [startUpload]);

    const dismissUpload = useCallback(() => {
        clearTimer(uploadTimerRef);
        pendingUploadRef.current = null;
        setUploadStatus("idle");
    }, []);

    const startDelete = useCallback(async ({ id }: PostToDelete) => {
        setDeletedIds((prev) => new Set(prev).add(id));
        if (deletesInFlightRef.current === 0) deleteFailedRef.current = false;
        deletesInFlightRef.current += 1;
        clearTimer(deleteTimerRef);
        setDeleteStatus("running");
        try {
            await deletePost(id);
        } catch (e) {
            if (__DEV__) console.warn("Post delete failed:", e);
            deleteFailedRef.current = true;
            setDeletedIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        } finally {
            deletesInFlightRef.current -= 1;
            // Re-sync the lists with the server whether it worked or not.
            setPostsVersion((v) => v + 1);
            if (deletesInFlightRef.current === 0) {
                const failed = deleteFailedRef.current;
                setDeleteStatus(failed ? "error" : "done");
                deleteTimerRef.current = setTimeout(
                    () => setDeleteStatus("idle"),
                    failed ? ERROR_VISIBLE_MS : DONE_VISIBLE_MS,
                );
            }
        }
    }, []);

    const dismissDelete = useCallback(() => {
        clearTimer(deleteTimerRef);
        setDeleteStatus("idle");
    }, []);

    const value = useMemo(
        () => ({
            uploadStatus, startUpload, retryUpload, dismissUpload,
            deleteStatus, deletedIds, startDelete, dismissDelete,
            postsVersion,
        }),
        [
            uploadStatus, startUpload, retryUpload, dismissUpload,
            deleteStatus, deletedIds, startDelete, dismissDelete,
            postsVersion,
        ],
    );

    return <PostActivityContext.Provider value={value}>{children}</PostActivityContext.Provider>;
}

export const usePostActivity = () => useContext(PostActivityContext);
