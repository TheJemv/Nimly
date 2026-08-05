import { friendsApi } from '@/api/friends';
import { ESTILOS_DICEBEAR } from '@/constants/dicebear';
import { getThemeColor } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { formatRelativeTime } from '@/utils/dateFormatter';
import { createAvatar } from '@dicebear/core';
import { Stack } from 'expo-router';
import { SFSymbol, SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SvgXml } from 'react-native-svg';

const PAGE_SIZE = 20;

export default function NotificationsScreen() {
    const [notifications, setNotifications] = useState<any[]>([]);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    const channelRef = useRef<any>(null);
    const tintColor = getThemeColor("tint");

    // 1. FUNCIÓN PARA MARCAR TODO COMO LEÍDO EN LA BASE DE DATOS
    const markAllAsSeen = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', user.id)
                .neq('type', 'message')
                .eq('is_read', false);

            if (error) throw error;
        } catch (e) {
            console.error("Error al marcar todo como leído:", e);
        }
    };

    // 2. CARGA DE DATOS
    const fetchNotifications = async (pageNumber: number, isRefresh = false) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const from = pageNumber * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;

            const { data, error } = await supabase
                .from('notifications')
                .select('*, actor:profiles!actor_id(username, avatar_config)')
                .eq('user_id', user.id)
                .neq('type', 'message')
                .order('created_at', { ascending: false })
                .range(from, to);

            if (error) throw error;

            const newNotifs = data || [];

            if (isRefresh) {
                const readNotifs = newNotifs.map(n => ({ ...n, is_read: true }));
                setNotifications(readNotifs);
                setHasMore(newNotifs.length === PAGE_SIZE);
                markAllAsSeen();
            } else {
                setNotifications(prev => {
                    const existingIds = new Set(prev.map(n => n.id));
                    const filtered = newNotifs.filter(n => !existingIds.has(n.id));
                    return [...prev, ...filtered];
                });
                setHasMore(newNotifs.length === PAGE_SIZE);
            }
        } catch (error) {
            console.error("Fetch error:", error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
            setRefreshing(false);
        }
    };

    // 3. REALTIME (Corregido con ID único para evitar choques de caché)
    useEffect(() => {
        fetchNotifications(0, true);

        let isMounted = true;

        const initRealtime = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || !isMounted) return;

            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }

            // 🛡️ TRUCO: Nombre de canal único con timestamp para evitar colisiones en memoria
            const uniqueChannelName = `notifs_v4_${user.id}-${Date.now()}`;

            const channel = supabase.channel(uniqueChannelName)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'notifications',
                        filter: `user_id=eq.${user.id}`
                    },
                    async (payload) => {
                        if (payload.new.type === 'message') return;

                        const { data: actor } = await supabase
                            .from('profiles')
                            .select('username, avatar_config')
                            .eq('id', payload.new.actor_id)
                            .single();

                        if (isMounted) {
                            setNotifications(prev => [{ ...payload.new, actor }, ...prev]);
                        }
                    }
                )
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log("Canal de notificaciones conectado:", uniqueChannelName);
                    }
                });

            channelRef.current = channel;
        };

        initRealtime();

        return () => {
            isMounted = false;
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }
        };
    }, []);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        setPage(0);
        fetchNotifications(0, true);
    }, []);

    const renderItem = ({ item }: { item: any }) => {
        const type = item.type?.toUpperCase();
        const isFriendNotif = item.content === 'is now your friend.';
        const time = formatRelativeTime(item.created_at);

        const avatarSvg = (() => {
            const config = item.actor?.avatar_config;
            if (!config) return null;
            const estilo = ESTILOS_DICEBEAR.find(e => e.id === config.styleId) || ESTILOS_DICEBEAR[0];
            return createAvatar(estilo.collection as any, { ...config.options, radius: 50 }).toString();
        })();

        const ui = (() => {
            if (isFriendNotif) return { icon: "person.2.fill", color: "#34C759" };
            switch (type) {
                case 'LIKE': return { icon: "heart.fill", color: "#FF2D55" };
                case 'COMMENT': return { icon: "bubble.left.fill", color: tintColor };
                case 'FRIEND_REQUEST': return { icon: "person.badge.plus.fill", color: "#5856D6" };
                default: return { icon: "bell.fill", color: "#8E8E93" };
            }
        })();

        return (
            <TouchableOpacity
                style={styles.notificationItem}
                activeOpacity={0.7}
                onPress={() => {
                    if (type === 'FRIEND_REQUEST' && !isFriendNotif) {
                        Alert.alert("Friend Request", `Accept @${item.actor?.username}?`, [
                            { text: "Later", style: "cancel" },
                            { text: "Accept", onPress: () => friendsApi.acceptFriendship(item).then(onRefresh) }
                        ]);
                    }
                }}
            >
                <View style={styles.avatarWrapper}>
                    <View style={styles.avatarCircle}>
                        {avatarSvg ? <SvgXml xml={avatarSvg} width="100%" height="100%" /> : <View style={styles.avatarPlaceholder} />}
                    </View>
                    <View style={[styles.typeBadge, { backgroundColor: ui.color }]}>
                        <SymbolView name={ui.icon as SFSymbol} size={10} tintColor="#FFF" />
                    </View>
                </View>

                <View style={styles.textContainer}>
                    <Text style={styles.title} numberOfLines={2}>
                        <Text style={styles.boldText}>@{item.actor?.username}</Text> {item.content}
                    </Text>
                    <Text style={styles.time}>{time}</Text>
                </View>

                {!item.is_read && <View style={[styles.unreadDot, { backgroundColor: tintColor }]} />}
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{
                headerTitle: "Notifications",
                headerLargeTitle: true,
                headerStyle: { backgroundColor: '#000' },
                headerTintColor: getThemeColor('text'),
                headerShadowVisible: false,
                headerTransparent: false,
            }} />

            <FlatList
                data={notifications}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentInsetAdjustmentBehavior="automatic"
                onEndReached={() => {
                    if (!loadingMore && hasMore) {
                        setLoadingMore(true);
                        const nextPage = page + 1;
                        setPage(nextPage);
                        fetchNotifications(nextPage);
                    }
                }}
                onEndReachedThreshold={0.4}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
                ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 20 }} color="#666" /> : null}
                ListEmptyComponent={!loading ? <Text style={styles.emptyText}>No notifications yet.</Text> : null}
                contentContainerStyle={{ paddingBottom: 60 }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    notificationItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1C1C1E' },
    avatarWrapper: { width: 48, height: 48, marginRight: 14 },
    avatarCircle: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: '#1C1C1E' },
    avatarPlaceholder: { flex: 1, backgroundColor: '#2C2C2E' },
    typeBadge: { position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#000', alignItems: 'center', justifyContent: 'center' },
    textContainer: { flex: 1 },
    title: { color: '#EBEBF5', fontSize: 14, lineHeight: 18 },
    boldText: { color: '#FFF', fontWeight: '700' },
    time: { color: '#636366', fontSize: 12, marginTop: 4 },
    unreadDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 10 },
    emptyText: { color: '#636366', textAlign: 'center', marginTop: 100 }
});