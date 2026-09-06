import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ActionSheetIOS, Alert, Platform } from "react-native";

import { blocksApi } from "@/api/blocks";
import { deletePost, toggleLike } from "@/api/posts";
import { reportsApi } from "@/api/reports";

import { AuthContext } from "@/context/AuthContext";
import { useBlockedUsers } from "@/context/BlockedUsersContext";
import { supabase } from "@/lib/supabase";
import { promptReportReason } from "@/utils/moderation";
import { buildVideoSource } from "@/utils/videoSource";
import type { VideoSource } from "expo-video";

/** Extrae el path dentro del bucket 'media' de un valor que puede venir como
 *  path desnudo ("userId/file.jpg") o como URL completa (.../media/userId/file.jpg). */
const toStoragePath = (value: string): string => {
    const marker = "/media/";
    const i = value.lastIndexOf(marker);
    return i >= 0 ? value.slice(i + marker.length) : value;
};

// La columna `type` de posts nunca se guardaba bien para video (createPost
// no la seteaba), así que no es confiable — detectamos por extensión del
// archivo en vez de por esa columna. Cubre .mov (lo que graba la cámara en
// iOS) y .mp4/.m4v (lo que puede venir de la librería).
// Exportado: el feed (home) también lo necesita para decidir qué post-video
// es "el más visible" sin duplicar la regex.
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

    // Doble-tap sobre la imagen (estilo Instagram): SOLO da like, nunca lo
    // quita — si ya tenía like, el doble-tap no debe des-likearlo.
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

    // URL firmada de corta duración para el bucket privado 'media'
    // (en vez de exponer el access_token como header de la imagen).
    // Para video sigue siendo el fallback: si el HLS no está listo o revienta,
    // el player usa este MP4.
    const [mediaUrl, setMediaUrl] = useState<string | null>(null);
    useEffect(() => {
        let active = true;
        if (!post.media_url) { setMediaUrl(null); return; }
        supabase.storage
            .from('media')
            .createSignedUrl(toStoragePath(post.media_url), 3600)
            .then(({ data }) => { if (active) setMediaUrl(data?.signedUrl ?? null); })
            .catch(() => { if (active) setMediaUrl(null); });
        return () => { active = false; };
    }, [post.media_url]);

    // Streaming HLS: si el post ya está transcodeado ('ready') servimos el
    // playlist autenticado por el media API; si no, el MP4 de arriba.
    // Si el player revienta con HLS (endpoint caído, signed URL vencida a
    // mitad) -> hlsFailed y caemos al MP4 sin romper el post.
    const [hlsFailed, setHlsFailed] = useState(false);
    useEffect(() => { setHlsFailed(false); }, [post.id, post.playback_status]);

    const handleVideoError = useCallback(() => {
        if (post.playback_status === 'ready') setHlsFailed(true);
    }, [post.playback_status]);

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
                // 🟢 CORREGIDO: Pasamos post.media_url para que borre el archivo correcto del storage
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

    // Menú de moderación del botón "⚠️" en posts ajenos.
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