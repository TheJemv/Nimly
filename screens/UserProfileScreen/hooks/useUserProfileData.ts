import { blocksApi } from '@/api/blocks';
import { friendsApi } from '@/api/friends';
import { supabase } from '@/lib/supabase';
import { useCallback, useEffect, useState } from 'react';

export function useUserProfileData(id: string) {
    const [profile, setProfile] = useState<any>(null);
    const [statusInfo, setStatusInfo] = useState<any>(null);
    const [friendsCount, setFriendsCount] = useState(0);
    const [userPosts, setUserPosts] = useState<any[]>([]);
    const [blockStatus, setBlockStatus] = useState<{ iBlockedThem: boolean; theyBlockedMe: boolean }>({
        iBlockedThem: false,
        theyBlockedMe: false,
    });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchUserData = useCallback(async () => {
        try {
            const { data: profileData } = await supabase.from('profiles').select('*').eq('id', id).single();
            setProfile(profileData);

            const block = await blocksApi.getBlockStatus(id);
            setBlockStatus(block);

            if (block.iBlockedThem || block.theyBlockedMe) {
                setLoading(false);
                setRefreshing(false);
                return;
            }

            const status = await friendsApi.getStatus(id);
            setStatusInfo(status);

            if (status?.status === 'ACCEPTED') {
                const [count, posts] = await Promise.all([
                    friendsApi.getFriendsCount(id),
                    supabase
                        .from('posts_with_stats')
                        .select('*')
                        .eq('user_id', id)
                        .order('created_at', { ascending: false })
                ]);
                setFriendsCount(count);
                setUserPosts(posts.data || []);
            }
        } catch (error) {
            console.error("Error fetching user data:", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [id]);

    useEffect(() => {
        fetchUserData();

        const channel = supabase.channel(`profile-${id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'friends' }, () => fetchUserData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, () => fetchUserData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'blocked_users' }, () => fetchUserData())
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [id, fetchUserData]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchUserData();
    };

    return {
        profile, statusInfo, friendsCount, userPosts, blockStatus,
        loading, refreshing, onRefresh, refetch: fetchUserData,
    };
}