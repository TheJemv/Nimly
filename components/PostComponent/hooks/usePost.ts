import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ActionSheetIOS, Alert, Platform } from "react-native";

import { blocksApi } from "@/api/blocks";
import { deletePost, toggleLike } from "@/api/posts";
import { reportsApi } from "@/api/reports";

import { AuthContext } from "@/context/AuthContext";
import { useBlockedUsers } from "@/context/BlockedUsersContext";
import { getCachedMedia } from "@/utils/mediaCache";
import { promptReportReason } from "@/utils/moderation";
import { buildVideoSource } from "@/utils/videoSource";
import type { VideoSource } from "expo-video";

/** Extracts the path inside the 'media' bucket from a value that may come as a
 *  bare path ("userId/file.jpg") or a full URL (.../media/userId/file.jpg). */
const toStoragePath = (value: string): string => {
    const marker = "/media/";
    const i = value.lastIndexOf(marker);
    return i >= 0 ? value.slice(i + marker.length) : value;
};

// The posts `type` column was never saved correctly for video (createPost
// didn't set it), so it's unreliable — we detect by file extension instead
// of that column. Covers .mov (what the iOS camera records) and .mp4/.m4v
// (what may come from the library).
// Exported: the feed (home) also needs it to decide which video-post is
// "the most visible" without duplicating the regex.
export const isVideoPath = (path: string): boolean => /\.(mp4|mov|m4v|avi|webm)$/i.test(path);

//  useLike / usePost
export function usePost(post: any, onDelete?: () => void) {
    const { session } = useContext(AuthContext)
    const { blockLocally, unblockLocally } = useBlockedUsers();

    //  ==== Likes ====
    const [likesCount, setLikesCount] = useState<number>(post.likes_count || 0);
    const [isLiked, setIsLiked] = useState<boolean>(post.is_liked_by_me || false);

    const handleLike = async () => {
        const prevLiked = isLiked;
        const prevCount = likesCount;
        setIsLiked(!isLiked);
        setLikesCount(prev => isLiked ? prev - 1 : prev + 1);

        try {
            await toggleLike(post.id);
        } catch {
            setIsLiked(prevLiked);
            setLikesCount(prevCount);
        }
    };

    // Double-tap on the image (Instagram style): ONLY likes, never unlikes
    // — if it was already liked, double-tap must not unlike it.
    const handleDoubleTapLike = () => {
        if (!isLiked) handleLike();
    };

    useEffect(() => {
        setLikesCount(post.likes_count || 0);
        setIsLiked(post.is_liked_by_me || false);
    }, [post.likes_count, post.is_liked_by_me, post.comments_count]);


    //  ==== Comments ====
    const [commentsCount, setCommentsCount] = useState(post.comments_count || 0);
    useEffect(() => {
        setCommentsCount(post.comments_count || 0);
    }, [post.comments_count])


    //  ==== Information ====
    const isOwner = session?.user.id === post.user_id;

    const isMedia = Boolean(post.media_url);
    const isVideo = isMedia && isVideoPath(post.media_url);

    const [mediaUrl, setMediaUrl] = useState<string | null>(null);

    // HLS streaming: if the post is already transcoded ('ready') we serve
    // the playlist authenticated via the media API; otherwise the MP4 below.
    // If the player blows up with HLS (endpoint down, signed URL expired
    // mid-stream) -> hlsFailed and we fall back to the MP4 without breaking the post.
    const [hlsFailed, setHlsFailed] = useState(false);
    useEffect(() => { setHlsFailed(false); }, [post.id, post.playback_status]);

    const handleVideoError = useCallback(() => {
        if (post.playback_status === 'ready') setHlsFailed(true);
    }, [post.playback_status]);

    // Media from the 'media' bucket resolved via disk cache (mediaCache):
    // 1st view downloads + signs; subsequent ones = local `file://`, zero network.
    // If the cache fails it degrades to the remote URL (or null).
    //
    // NOTE: for a video with HLS ready and no failure we do NOT touch the
    // MP4 — those are tens of MB and the server's pipe is 10 Mbps. We only
    // resolve it if it's actually going to play: image, video without HLS
    // ('raw'/'error'), or after the HLS blows up (hlsFailed).
    useEffect(() => {
        let active = true;
        if (!post.media_url) { setMediaUrl(null); return; }

        const needsMp4 = !isVideo || post.playback_status !== 'ready' || hlsFailed;
        if (!needsMp4) { setMediaUrl(null); return; }

        getCachedMedia('media', toStoragePath(post.media_url), { signed: true, ttl: 3600 })
            .then((uri) => { if (active) setMediaUrl(uri); })
            .catch(() => { if (active) setMediaUrl(null); });
        return () => { active = false; };
    }, [post.media_url, isVideo, post.playback_status, hlsFailed]);

    const videoSource: VideoSource = useMemo(
        () => buildVideoSource({
            ownerId: post.user_id,
            mediaId: post.id,
            playbackStatus: post.playback_status,
            mp4Url: mediaUrl,
            accessToken: session?.access_token,
            hlsFailed,
        }),
        [post.user_id, post.id, post.playback_status, mediaUrl, session?.access_token, hlsFailed],
    );

    const postText = post.content;
    const date = new Date(post.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });
    const username = post.username || 'user';


    //  ==== Actions ====
    const handleDelete = () => {
        const performDelete = async () => {
            try {
                // FIXED: we pass post.media_url so it deletes the correct file from storage
                await deletePost(post.id, isMedia ? post.media_url : null);
                if (onDelete) onDelete();
            } catch {
                Alert.alert("Error", "Could not delete the post");
            }
        };

        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    options: ['Cancel', 'Delete'],
                    destructiveButtonIndex: 1,
                    cancelButtonIndex: 0,
                    title: 'Delete this post?',
                },
                (index) => { if (index === 1) performDelete(); }
            );
        } else {
            Alert.alert("Delete", "Delete this post?", [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: performDelete }
            ]);
        }
    };

    const reportPost = async (postId: string) => {
        const reason = await promptReportReason("Report post", "Why are you reporting this post?");
        if (!reason) return;
        try {
            await reportsApi.submitReport({ targetPostId: postId, reason });
            Alert.alert("Report received", "Thanks. Our team reviews reports within 24 hours.");
        } catch (error: any) {
            if (error.message === "AlreadyReported") {
                Alert.alert("Note", "You have already reported this post.");
            } else {
                Alert.alert("Error", "The report could not be sent.");
            }
        }
    };

    const blockAuthor = () => {
        const targetId = post.user_id;
        Alert.alert(
            "Block user",
            `@${post.username || 'this user'} will no longer be able to contact you or see your content, and their posts will disappear from your feed.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Block",
                    style: "destructive",
                    onPress: async () => {
                        const reason = await promptReportReason(
                            "Block user",
                            "Tell us what's wrong so we can review this account.",
                        );
                        blockLocally(targetId);
                        onDelete?.();
                        try {
                            await blocksApi.blockUser(targetId, reason ?? 'other');
                        } catch (e: any) {
                            if (e?.message !== "AlreadyBlocked") {
                                unblockLocally(targetId);
                                Alert.alert("Error", "Action could not be completed.");
                            }
                        }
                    },
                },
            ],
        );
    };

    // Moderation menu for the "⚠️" button on other people's posts.
    const handleReportPost = (postId: string) => {
        const authorLabel = `@${post.username || 'user'}`;
        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    options: ['Cancel', 'Report post', `Block ${authorLabel}`],
                    destructiveButtonIndex: 2,
                    cancelButtonIndex: 0,
                    title: 'This post',
                },
                (index) => {
                    if (index === 1) reportPost(postId);
                    if (index === 2) blockAuthor();
                },
            );
        } else {
            Alert.alert('This post', undefined, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Report post', onPress: () => reportPost(postId) },
                { text: `Block ${authorLabel}`, style: 'destructive', onPress: blockAuthor },
            ]);
        }
    };

    return {
        isLiked,
        likesCount,
        commentsCount,
        handleLike,
        handleDoubleTapLike,

        isMedia,
        isVideo,
        mediaUrl,
        videoSource,
        handleVideoError,

        postText,
        date,

        username,
        isOwner,

        handleDelete,
        handleReportPost,
    }
}