import { friendsApi } from '@/api/friends';
import EmptyState from '@/components/EmptyState';
import NotificationItem, {
    FRIEND_CONTENT,
    isFriendRequest,
    NotificationRow,
    NotificationsSkeleton,
    RequestAction,
} from '@/components/NotificationItem';
import { getThemeColor } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useFreshPostIds } from '@/hooks/usePostListAnimation';
import { supabase } from '@/lib/supabase';
import * as Haptics from 'expo-haptics';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    StyleSheet,
    Text,
    View
} from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

const PAGE_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const ROW_LAYOUT = LinearTransition.duration(250);
const ROW_ENTERING = FadeInDown.duration(300);
const ROW_EXITING = FadeOut.duration(200);

type ListItem =
    | { kind: 'header'; key: string; title: string }
    | { kind: 'row'; key: string; notification: NotificationRow };

/** Today / This week / Earlier, by calendar day (not "last 24h"). */
function sectionFor(createdAt: string, startOfToday: number): string {
    const t = new Date(createdAt).getTime();
    if (t >= startOfToday) return 'Today';
    if (t >= startOfToday - 6 * DAY_MS) return 'This week';
    return 'Earlier';
}

export default function NotificationsScreen() {
    const { session } = useAuth();
    const userId = session?.user?.id;

    const [notifications, setNotifications] = useState<NotificationRow[]>([]);
    // Ids that were unread when they reached this screen. They keep their red
    // dot and the "New" section for the whole visit, even though they're
    // marked read in the DB right away (that's what clears the bell badge).
    const [newIds, setNewIds] = useState<ReadonlySet<string>>(() => new Set());
    // Incoming PENDING requests, actor id -> friend_requests id. Decides which
    // request rows still get Accept / Decline.
    const [pendingByActor, setPendingByActor] = useState<ReadonlyMap<string, string>>(() => new Map());
    const [busy, setBusy] = useState<Record<string, RequestAction>>({});
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    const mutedColor = getThemeColor("textSecondary");

    const rememberNew = useCallback((rows: NotificationRow[]) => {
        const unread = rows.filter(n => !n.is_read).map(n => n.id);
        if (unread.length) setNewIds(prev => new Set([...prev, ...unread]));
    }, []);

    const markAllAsSeen = useCallback(async () => {
        if (!userId) return;
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', userId)
            .neq('type', 'message')
            .eq('is_read', false);

        if (error) console.error("Error marking all as read:", error);
    }, [userId]);

    const fetchPendingRequests = useCallback(async () => {
        if (!userId) return;
        const { data, error } = await supabase
            .from('friend_requests')
            .select('id, from_id')
            .eq('to_id', userId)
            .eq('status', 'PENDING');

        if (error) {
            console.error("Error loading pending requests:", error);
            return;
        }
        setPendingByActor(new Map((data ?? []).map(r => [r.from_id, r.id])));
    }, [userId]);

    // Cursor-paginated by created_at (no `before` = first page / refresh).
    // An offset would skip a row at the page boundary once Decline deletes one.
    const fetchNotifications = useCallback(async (before?: string) => {
        if (!userId) return;
        try {
            let query = supabase
                .from('notifications')
                .select('*, actor:profiles!actor_id(username, avatar_config)')
                .eq('user_id', userId)
                .neq('type', 'message')
                .order('created_at', { ascending: false })
                .limit(PAGE_SIZE);
            if (before) query = query.lt('created_at', before);

            const { data, error } = await query;
            if (error) throw error;

            const rows = (data ?? []) as NotificationRow[];
            rememberNew(rows);
            setHasMore(rows.length === PAGE_SIZE);

            if (!before) {
                setNotifications(rows);
                markAllAsSeen();
            } else {
                setNotifications(prev => {
                    const existingIds = new Set(prev.map(n => n.id));
                    return [...prev, ...rows.filter(n => !existingIds.has(n.id))];
                });
            }
        } catch (error) {
            console.error("Fetch error:", error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
            setRefreshing(false);
        }
    }, [userId, rememberNew, markAllAsSeen]);

    // INITIAL LOAD + REALTIME
    useEffect(() => {
        if (!userId) return;
        fetchNotifications();
        fetchPendingRequests();

        let isMounted = true;
        const channelName = `notifs_v4_${userId}-${Date.now()}`;
        const channel = supabase.channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${userId}`
                },
                async (payload) => {
                    const row = payload.new as NotificationRow;
                    if (row.type === 'message') return;

                    const { data: actor } = await supabase
                        .from('profiles')
                        .select('username, avatar_config')
                        .eq('id', row.actor_id)
                        .single();

                    if (!isMounted) return;
                    setNotifications(prev =>
                        prev.some(n => n.id === row.id) ? prev : [{ ...row, actor }, ...prev]
                    );
                    setNewIds(prev => new Set(prev).add(row.id));
                    if (isFriendRequest(row)) fetchPendingRequests();
                    // It's already on screen: don't leave it counting on the bell.
                    markAllAsSeen();
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED' && __DEV__) {
                    console.log("Notifications channel connected:", channelName);
                }
            });

        return () => {
            isMounted = false;
            supabase.removeChannel(channel);
        };
    }, [userId, fetchNotifications, fetchPendingRequests, markAllAsSeen]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchNotifications();
        fetchPendingRequests();
    }, [fetchNotifications, fetchPendingRequests]);

    const loadMore = useCallback(() => {
        const last = notifications[notifications.length - 1];
        if (loadingMore || !hasMore || !last) return;
        setLoadingMore(true);
        fetchNotifications(last.created_at);
    }, [notifications, loadingMore, hasMore, fetchNotifications]);

    const settleRequest = useCallback((n: NotificationRow) => {
        setPendingByActor(prev => {
            const next = new Map(prev);
            next.delete(n.actor_id);
            return next;
        });
        setBusy(({ [n.id]: _done, ...rest }) => rest);
    }, []);

    // The pending map is the source of truth; getStatus covers a request that
    // arrived after the map was loaded.
    const resolveRequestId = useCallback(async (n: NotificationRow): Promise<string | null> => {
        const known = pendingByActor.get(n.actor_id);
        if (known) return known;
        const status = await friendsApi.getStatus(n.actor_id);
        return status?.status === 'PENDING' && status.isReceiver ? status.requestId ?? null : null;
    }, [pendingByActor]);

    const handleAccept = useCallback(async (n: NotificationRow) => {
        setBusy(prev => ({ ...prev, [n.id]: 'accept' }));
        try {
            const requestId = await resolveRequestId(n);
            if (!requestId) {
                Alert.alert("Request unavailable", "This friend request is no longer pending.");
                settleRequest(n);
                return;
            }

            await friendsApi.acceptFriendship({
                request_id: requestId,
                id: n.id,
                user_id: n.user_id,
                actor_id: n.actor_id,
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
            setNotifications(prev =>
                prev.map(x => x.id === n.id ? { ...x, content: FRIEND_CONTENT, is_read: true } : x)
            );
            settleRequest(n);
        } catch {
            setBusy(({ [n.id]: _failed, ...rest }) => rest);
            Alert.alert("Error", "Could not accept the request.");
        }
    }, [resolveRequestId, settleRequest]);

    const handleDecline = useCallback(async (n: NotificationRow) => {
        setBusy(prev => ({ ...prev, [n.id]: 'decline' }));
        try {
            const requestId = await resolveRequestId(n);
            if (requestId) await friendsApi.declineRequest({ requestId, notificationId: n.id });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
            setNotifications(prev => prev.filter(x => x.id !== n.id));
            settleRequest(n);
        } catch {
            setBusy(({ [n.id]: _failed, ...rest }) => rest);
            Alert.alert("Error", "Could not decline the request.");
        }
    }, [resolveRequestId, settleRequest]);

    // "New" first (everything that arrived unread), then the rest by day.
    const items = useMemo<ListItem[]>(() => {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const out: ListItem[] = [];
        let current = '';
        const push = (title: string, n: NotificationRow) => {
            if (title !== current) {
                current = title;
                out.push({ kind: 'header', key: `section-${title}`, title });
            }
            out.push({ kind: 'row', key: n.id, notification: n });
        };
        for (const n of notifications) if (newIds.has(n.id)) push('New', n);
        for (const n of notifications) if (!newIds.has(n.id)) push(sectionFor(n.created_at, startOfToday), n);
        return out;
    }, [notifications, newIds]);

    // Only rows that really arrived (realtime, refresh, next page) fade in.
    const freshIds = useFreshPostIds(notifications);

    const renderItem = useCallback(({ item, index }: { item: ListItem; index: number }) => {
        if (item.kind === 'header') {
            return (
                <Animated.View exiting={ROW_EXITING}>
                    <Text style={[styles.sectionTitle, index === 0 && styles.sectionTitleFirst]}>{item.title}</Text>
                </Animated.View>
            );
        }
        const n = item.notification;
        return (
            <Animated.View entering={freshIds.has(n.id) ? ROW_ENTERING : undefined} exiting={ROW_EXITING}>
                <NotificationItem
                    notification={n}
                    isNew={newIds.has(n.id)}
                    showRequestActions={isFriendRequest(n) && pendingByActor.has(n.actor_id)}
                    busy={busy[n.id]}
                    onAccept={handleAccept}
                    onDecline={handleDecline}
                />
            </Animated.View>
        );
    }, [freshIds, newIds, pendingByActor, busy, handleAccept, handleDecline]);

    return (
        <View style={styles.container}>
            <Stack.Screen options={{
                headerTitle: "Notifications",
                headerLargeTitle: true,
                headerTintColor: getThemeColor('text'),
                headerShadowVisible: false,
                headerTransparent: false,
                headerStyle: { backgroundColor: getThemeColor("background") },
                contentStyle: { backgroundColor: getThemeColor("background") },
            }} />

            <Animated.FlatList
                data={items}
                keyExtractor={(item) => item.key}
                renderItem={renderItem}
                itemLayoutAnimation={ROW_LAYOUT}
                skipEnteringExitingAnimations
                contentInsetAdjustmentBehavior="automatic"
                onEndReached={loadMore}
                onEndReachedThreshold={0.4}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
                ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 20 }} color={mutedColor} /> : null}
                ListEmptyComponent={loading ? <NotificationsSkeleton /> : (
                    <EmptyState
                        icon="bell"
                        title="No notifications yet"
                        message="Likes, comments and friend requests will show up here."
                        style={styles.empty}
                    />
                )}
                contentContainerStyle={{ paddingBottom: 60 }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    sectionTitle: { color: '#FFF', fontSize: 17, fontWeight: '700', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 6 },
    sectionTitleFirst: { paddingTop: 8 },
    empty: { marginTop: 100 },
});
