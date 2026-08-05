import { getComments } from '@/api/comments';
import { useCallback, useEffect, useState } from 'react';

export function useComments(postId: string | null) {
    const [comments, setComments] = useState<any[]>([]);

    const loadComments = useCallback(async () => {
        if (!postId) return;
        const data = await getComments(postId, 0);
        setComments(data);
    }, [postId]);

    useEffect(() => {
        if (postId) loadComments();
    }, [postId, loadComments]);

    const addComment = (newComment: any) => {
        setComments(prev => [newComment, ...prev]);
    };

    return { comments, addComment };
}