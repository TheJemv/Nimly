import { toggleLike } from "@/api/posts";
import { AuthContext } from "@/context/AuthContext";
import { supabaseUrl } from "@/lib/supabase";
import { useContext, useEffect, useState } from "react";

//  useLike
export function usePost(post: any) {
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
        sessionToken
    }
}