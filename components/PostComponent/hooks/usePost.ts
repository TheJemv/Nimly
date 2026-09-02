import { useContext, useEffect, useState } from "react";
import { ActionSheetIOS, Alert, Platform } from "react-native";

import { deletePost, toggleLike } from "@/api/posts";
import { reportsApi } from "@/api/reports";

import { AuthContext } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

/** Extrae el path dentro del bucket 'media' de un valor que puede venir como
 *  path desnudo ("userId/file.jpg") o como URL completa (.../media/userId/file.jpg). */
const toStoragePath = (value: string): string => {
    const marker = "/media/";
    const i = value.lastIndexOf(marker);
    return i >= 0 ? value.slice(i + marker.length) : value;
};

//  useLike / usePost
export function usePost(post: any, onDelete?: () => void) {
    const { session } = useContext(AuthContext)

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

    // URL firmada de corta duración para el bucket privado 'media'
    // (en vez de exponer el access_token como header de la imagen).
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

    const handleReportPost = (postId: string) => {
        Alert.alert(
            "Report Entry", 
            "Are you sure you want to flag this content? Our security protocols will review it shortly.", 
            [{
                text: "Cancel",
                style: "cancel",
            },
            {
                text: "Report",
                style: "destructive", 
                onPress: async () => {
                    try {
                        await reportsApi.submitReport({
                            targetPostId: postId,
                            reason: 'inappropriate_content' 
                        });

                        Alert.alert("Success", "Report filed. Access to this content may be restricted soon.");
                    } catch (error: any) {
                        if (error.message === "AlreadyReported") {
                            Alert.alert("Note", "You have already flagged this post.");
                        } else {
                            Alert.alert("Error", "The secure report could not be sent.");
                        }
                    }
                },
            }],
            { cancelable: true }
        );
    };

    return { 
        isLiked, 
        likesCount, 
        commentsCount, 
        handleLike,

        isMedia,
        mediaUrl,

        postText,
        date,

        username,
        isOwner,

        handleDelete,
        handleReportPost,
    }
}