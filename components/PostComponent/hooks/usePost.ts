import { useContext, useEffect, useState } from "react";
import { ActionSheetIOS, Alert, Platform } from "react-native";

import { deletePost, toggleLike } from "@/api/posts";
import { reportsApi } from "@/api/reports";

import { AuthContext } from "@/context/AuthContext";
import { supabaseUrl } from "@/lib/supabase";

//  useLike
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
        } catch (error) {
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
    const isMedia = post.type === 'IMAGE' || post.type === 'VIDEO';
    const mediaUrl = isMedia && post.content
        ? `${supabaseUrl}/storage/v1/object/authenticated/media/${post.content}`
        : null;

    const postText = post.type === 'TEXT' ? post.content : '';
    const date = new Date(post.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });
    const username = post.username || 'Usuario';
    const sessionToken = session?.access_token


    //  ==== Actions ====
    const handleDelete = () => {
        const performDelete = async () => {
            try {
                await deletePost(post.id, isMedia ? post.content : null);
                if (onDelete) onDelete();
            } catch (e) {
                Alert.alert("Error", "No se pudo eliminar");
            }
        };

        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    options: ['Cancelar', 'Eliminar'],
                    destructiveButtonIndex: 1,
                    cancelButtonIndex: 0,
                    title: '¿Eliminar publicación?',
                },
                (index) => { if (index === 1) performDelete(); }
            );
        } else {
            Alert.alert("Eliminar", "¿Borrar este post?", [
                { text: "Cancelar", style: "cancel" },
                { text: "Eliminar", style: "destructive", onPress: performDelete }
            ]);
        }
    };

    const handleReportPost = (postId: string) => {
        Alert.alert(
            "Report Entry", // Título
            "Are you sure you want to flag this content? Our security protocols will review it shortly.", // Mensaje
            [{
                text: "Cancel",
                style: "cancel", // Estilo estándar de cancelación
            },
            {
                text: "Report",
                style: "destructive", // Este es el truco para que salga en ROJO en iOS
                onPress: async () => {
                    try {
                        await reportsApi.submitReport({
                            targetPostId: postId,
                            reason: 'inappropriate_content' // O el motivo que prefieras
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
        sessionToken,

        handleDelete,
        handleReportPost,
    }
}