import { blocksApi } from '@/api/blocks';
import { friendsApi } from '@/api/friends';
import { reportsApi } from '@/api/reports';
import CommentsSheet from "@/components/comments-sheet";
import PostComponent from "@/components/post";
import { ThemedText } from '@/components/themed-text';
import { ESTILOS_DICEBEAR } from "@/constants/dicebear";
import { getThemeColor } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { createAvatar } from "@dicebear/core";
import { Button, ContextMenu, Host, Image as SwiftImage } from '@expo/ui/swift-ui';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from "expo-symbols";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SvgXml } from "react-native-svg";

export default function UserProfileScreen() {
    const { id } = useLocalSearchParams();

    // Estados de datos
    const [profile, setProfile] = useState<any>(null);
    const [statusInfo, setStatusInfo] = useState<any>(null);
    const [friendsCount, setFriendsCount] = useState(0);
    const [userPosts, setUserPosts] = useState<any[]>([]);
    const [blockStatus, setBlockStatus] = useState<{ iBlockedThem: boolean; theyBlockedMe: boolean }>({ iBlockedThem: false, theyBlockedMe: false });

    // Estados de carga
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Referencias
    const bottomSheetModalRef = useRef<BottomSheetModal>(null);
    const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);

    // Colores del tema
    const bg = getThemeColor('background');
    const accent = getThemeColor('tint');
    const surface = getThemeColor('surface');
    const glassBorder = getThemeColor('glassBorder');

    const fetchUserData = useCallback(async () => {
        try {
            const { data: profileData } = await supabase.from('profiles').select('*').eq('id', id).single();
            setProfile(profileData);

            const block = await blocksApi.getBlockStatus(id as string);
            setBlockStatus(block);

            // Si hay bloqueo en cualquier dirección, no cargamos info de amistad/posts
            if (block.iBlockedThem || block.theyBlockedMe) {
                setLoading(false);
                setRefreshing(false);
                return;
            }

            const status = await friendsApi.getStatus(id as string);
            setStatusInfo(status);

            if (status?.status === 'ACCEPTED') {
                const [count, posts] = await Promise.all([
                    friendsApi.getFriendsCount(id as string),
                    supabase
                        .from('posts_with_stats') // Usamos la vista para likes/comentarios
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
    }, [id]);

    // --- ACCIONES DEL MENU ---
    const handleCopyUsername = async () => {
        if (profile?.username) {
            await Clipboard.setStringAsync(`@${profile.username}`);
            Alert.alert("Link Copied", "Username stored in your secure vault.");
        }
    };

    const handleSeverConnection = () => {
        Alert.alert(
            "Sever Connection",
            `This will terminate all encrypted access with @${profile?.username}. Are you sure?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Sever",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            setLoading(true);
                            await friendsApi.severConnection(id as string);
                            await fetchUserData();
                        } catch (e) {
                            Alert.alert("Error", "Action could not be completed.");
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const handleBlockUser = () => {
        Alert.alert(
            "Block User",
            `@${profile?.username} will no longer be able to contact you, see your content, or send you connection requests. Their content will be removed from your feed immediately.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Block",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            setLoading(true);
                            await blocksApi.blockUser(id as string);
                            await fetchUserData();
                        } catch (e: any) {
                            if (e.message === "AlreadyBlocked") {
                                Alert.alert("Note", "You have already blocked this user.");
                            } else {
                                Alert.alert("Error", "Action could not be completed.");
                            }
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const handleUnblockUser = () => {
        Alert.alert(
            "Unblock User",
            `@${profile?.username} will be able to interact with you again.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Unblock",
                    onPress: async () => {
                        try {
                            setLoading(true);
                            await blocksApi.unblockUser(id as string);
                            await fetchUserData();
                        } catch (e) {
                            Alert.alert("Error", "Action could not be completed.");
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    // --- ACCIONES DE INTERACCIÓN ---
    const handleOpenComments = (postId: string) => {
        setActiveCommentPostId(postId);
        bottomSheetModalRef.current?.present();
    };

    const handleConnectAction = async () => {
        setSending(true);
        try {
            if (statusInfo?.isReceiver) {
                await friendsApi.acceptFriendship({
                    id: statusInfo.requestId,
                    from_id: id,
                    to_id: (await supabase.auth.getUser()).data.user?.id
                });
            } else {
                await friendsApi.sendRequest(id as string);
            }
            fetchUserData();
        } catch (error: any) {
            Alert.alert("Error", error.message);
        } finally {
            setSending(false);
        }
    };

    const userAvatarSvg = useMemo(() => {
        if (!profile?.avatar_config) return null;
        const config = profile.avatar_config;
        const style = ESTILOS_DICEBEAR.find(e => e.id === config.styleId) || ESTILOS_DICEBEAR[0];
        return createAvatar(style.collection, { ...config.options, radius: 50 }).toString();
    }, [profile]);

    const handleReportUser = async () => {
        try {
            await reportsApi.submitReport({
                targetUserId: profile.id,
                reason: 'harassment'
            });
            Alert.alert("Report Filed", "Our security protocols have logged your report.");
        } catch (error: any) {
            if (error.message === "AlreadyReported") {
                Alert.alert("Note", "You have already reported this user.");
            }
        }
    };

    if (loading) return <View style={styles.center}><ActivityIndicator color={accent} /></View>;

    const isAccepted = statusInfo?.status === 'ACCEPTED';
    const isPending = statusInfo?.status === 'PENDING';
    const amIReceiver = statusInfo?.isReceiver;
    const { iBlockedThem, theyBlockedMe } = blockStatus;
    const isBlockedEitherWay = iBlockedThem || theyBlockedMe;

    return (
        <View style={{ flex: 1, backgroundColor: bg }}>
            <Stack.Screen
                options={{
                    headerShown: true,
                    headerTitle: profile?.username ? `@${profile.username}` : "Profile",
                    headerShadowVisible: false,
                    headerStyle: { backgroundColor: "#000" },
                    headerTintColor: "#fff",
                    headerTransparent: false,
                    headerRight: () => (
                        <Host style={{ width: 32, height: 32 }}>
                            {/* Agregamos una 'key' única basada en los estados que pueden cambiar.
                                Esto obliga a React a re-inicializar el ContextMenu cada vez 
                                que la info de bloqueo o estatus cambie.
                            */}

                            <ContextMenu key={`${blockStatus.iBlockedThem}-${isAccepted}`}>
                                <ContextMenu.Items>
                                    {isAccepted && (
                                        <Button
                                            systemImage='document.on.document.fill'
                                            label='Copy Username'
                                            onPress={handleCopyUsername}
                                        />
                                    )}
                                    {!iBlockedThem && (
                                        <Button
                                            systemImage='person.badge.shield.exclamationmark.fill'
                                            label='Report User'
                                            onPress={handleReportUser}
                                        />
                                    )}
                                    {isAccepted && (
                                        <Button
                                            systemImage='person.fill.badge.minus'
                                            label='Sever Connection'
                                            role='destructive'
                                            onPress={handleSeverConnection}
                                        />
                                    )}
                                    {iBlockedThem ? (
                                        <Button
                                            systemImage='lock.open.fill'
                                            label='Unblock User'
                                            onPress={handleUnblockUser}
                                        />
                                    ) : (
                                        <Button
                                            systemImage='hand.raised.fill'
                                            label='Block User'
                                            role='destructive'
                                            onPress={handleBlockUser}
                                        />
                                    )}
                                </ContextMenu.Items>

                                <ContextMenu.Trigger>
                                    <SwiftImage systemName="ellipsis" />
                                </ContextMenu.Trigger>
                            </ContextMenu>
                        </Host>
                    ),
                }}
            />

            {theyBlockedMe ? (
                <View style={styles.blockedArea}>
                    <Ionicons name="ban" size={48} color="#ff3b30" />
                    <ThemedText style={styles.blockedTitle}>Unavailable</ThemedText>
                    <ThemedText style={styles.blockedSubtitle}>
                        This profile is not available.
                    </ThemedText>
                </View>
            ) : iBlockedThem ? (
                <View style={styles.blockedArea}>
                    <Ionicons name="hand-left" size={48} color={accent} />
                    <ThemedText style={styles.blockedTitle}>You blocked @{profile?.username}</ThemedText>
                    <ThemedText style={styles.blockedSubtitle}>
                        You won't see their content and they can't contact you.
                    </ThemedText>
                    <TouchableOpacity
                        style={[styles.connectBtn, { backgroundColor: surface, borderWidth: 1, borderColor: glassBorder, marginTop: 20 }]}
                        onPress={handleUnblockUser}
                    >
                        <Text style={[styles.btnText, { color: '#fff' }]}>UNBLOCK</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView
                    contentInsetAdjustmentBehavior="automatic"
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => { setRefreshing(true); fetchUserData(); }}
                            tintColor={accent}
                        />
                    }
                >
                    {/* PERFIL INFO */}
                    <View style={styles.headerSection}>
                        <View style={styles.topRow}>
                            <View style={[styles.avatarWrapper, { borderColor: isAccepted ? '#4ade80' : glassBorder }]}>
                                {userAvatarSvg ? <SvgXml xml={userAvatarSvg} width="100" height="100" /> : <View style={styles.placeholder} />}
                            </View>

                            {isAccepted && (
                                <View style={styles.statsRow}>
                                    <View style={styles.statItem}>
                                        <SymbolView name='person.2.fill' size={20} tintColor="#fff" />
                                        <ThemedText style={styles.statNumber}>{friendsCount}</ThemedText>
                                        <ThemedText style={styles.statLabel}>Friends</ThemedText>
                                    </View>
                                    <View style={styles.statItem}>
                                        <SymbolView name='doc.text.fill' size={20} tintColor="#fff" />
                                        <ThemedText style={styles.statNumber}>{userPosts.length}</ThemedText>
                                        <ThemedText style={styles.statLabel}>Posts</ThemedText>
                                    </View>
                                </View>
                            )}
                        </View>

                        <View style={styles.bioSection}>
                            <ThemedText style={styles.bioText}>
                                {profile?.description || "Profile data encrypted."}
                            </ThemedText>
                        </View>
                    </View>

                    {/* LOGICA DE ACCESO (VAULT) */}
                    {!isAccepted ? (
                        <View style={styles.lockedArea}>
                            <View style={[styles.lockedCard, { backgroundColor: surface, borderColor: isPending ? '#fbbf24' : accent }]}>
                                <Ionicons
                                    name={isPending ? "timer-outline" : "lock-closed"}
                                    size={40}
                                    color={isPending ? '#fbbf24' : accent}
                                />
                                <ThemedText style={styles.lockedTitle}>
                                    {isPending ? (amIReceiver ? "Action Required" : "Pending Approval") : "Vault Locked"}
                                </ThemedText>
                                <TouchableOpacity
                                    style={[
                                        styles.connectBtn,
                                        { backgroundColor: amIReceiver ? '#4ade80' : (isPending ? 'rgba(255,255,255,0.1)' : accent) }
                                    ]}
                                    onPress={handleConnectAction}
                                    disabled={(isPending && !amIReceiver) || sending}
                                >
                                    {sending ? <ActivityIndicator color="#fff" /> :
                                        <Text style={styles.btnText}>
                                            {isPending ? (amIReceiver ? "ESTABLISH ACCESS" : "REQUEST SENT") : "CONNECT TO VAULT"}
                                        </Text>
                                    }
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : (
                        <View style={styles.feed}>
                            {userPosts.map(post => (
                                <PostComponent
                                    key={post.id}
                                    post={post}
                                    onCommentPress={() => handleOpenComments(post.id)}
                                />
                            ))}
                        </View>
                    )}
                </ScrollView>
            )}

            <CommentsSheet
                ref={bottomSheetModalRef}
                postId={activeCommentPostId}
                postOwnerId={id as string}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
    headerSection: { paddingHorizontal: 20, marginBottom: 24, marginTop: 10 },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
    avatarWrapper: { width: 100, height: 100, borderRadius: 50, borderWidth: 2, overflow: 'hidden', backgroundColor: '#111' },
    statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
    statItem: { alignItems: 'center' },
    statNumber: { fontSize: 16, fontWeight: 'bold', marginTop: 4, color: '#fff' },
    statLabel: { fontSize: 10, opacity: 0.6, color: '#fff' },
    bioSection: { marginTop: 16 },
    bioText: { color: '#8E8E93', fontSize: 15, lineHeight: 22 },
    lockedArea: { padding: 20 },
    lockedCard: { padding: 32, borderRadius: 28, borderWidth: 1, alignItems: 'center', borderStyle: 'dashed' },
    lockedTitle: { fontSize: 18, fontWeight: 'bold', marginVertical: 16, color: '#fff' },
    connectBtn: { width: '100%', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
    btnText: { color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
    feed: { paddingHorizontal: 16, gap: 16, paddingBottom: 60 },
    placeholder: { flex: 1, backgroundColor: '#1C1C1E' },
    blockedArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
    blockedTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginTop: 16, textAlign: 'center' },
    blockedSubtitle: { fontSize: 14, color: '#8E8E93', marginTop: 8, textAlign: 'center', lineHeight: 20 },
});