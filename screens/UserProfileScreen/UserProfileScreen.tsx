import CommentsSheet from "@/components/CommentsSheet";
import PostComponent from "@/components/PostComponent";
import { ThemedText } from '@/components/themed-text';
import UserAvatar from "@/components/UserAvatar";
import { getThemeColor } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from "expo-symbols";
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import ProfileHeaderMenu from './components/ProfileHeaderMenu';
import { useProfileActions, useUserProfileData } from './hooks';
import { styles } from './UserProfileScreen.styles';

export default function UserProfileScreen() {
    const { id, user: userParam } = useLocalSearchParams<{ id: string; user?: string }>();

    const bottomSheetModalRef = useRef<BottomSheetModal>(null);
    const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);

    const bg = getThemeColor('background');
    const accent = getThemeColor('tint');
    const surface = getThemeColor('surface');
    const glassBorder = getThemeColor('glassBorder');

    // Parsear de inmediato el objeto user que vino por los parámetros de la ruta
    const routeUser = useMemo(() => {
        if (!userParam) return null;
        try {
            return typeof userParam === 'string' ? JSON.parse(userParam) : userParam;
        } catch {
            return null;
        }
    }, [userParam]);

    const {
        profile, statusInfo, friendsCount, userPosts, blockStatus,
        loading, refreshing, onRefresh, refetch,
    } = useUserProfileData(id);

    // Priorizamos la base de datos pero usamos los datos del route de forma instantánea
    const displayUsername = profile?.username || routeUser?.username;
    const displayAvatarUrl = profile?.avatar_url || routeUser?.avatar_url;
    const displayAvatarConfig = profile?.avatar_config || routeUser?.avatar_config;

    const {
        sending,
        handleCopyUsername,
        handleSeverConnection,
        handleBlockUser,
        handleUnblockUser,
        handleConnectAction,
        handleReportUser,
    } = useProfileActions({
        id,
        username: displayUsername,
        statusInfo,
        setLoading: () => { },
        refetch,
    });

    const handleOpenComments = (postId: string) => {
        setActiveCommentPostId(postId);
        bottomSheetModalRef.current?.present();
    };

    const isAccepted = statusInfo?.status === 'ACCEPTED';
    const isPending = statusInfo?.status === 'PENDING';
    const amIReceiver = statusInfo?.isReceiver;
    const { iBlockedThem, theyBlockedMe } = blockStatus;

    return (
        <View style={{ flex: 1, backgroundColor: bg }}>
            <Stack.Screen
                options={{
                    headerShown: true,
                    headerTitle: displayUsername ? `@${displayUsername}` : "Profile",
                    headerShadowVisible: false,
                    headerStyle: { backgroundColor: "#000" },
                    headerTintColor: "#fff",
                    headerTransparent: false,
                    headerRight: () => (
                        <ProfileHeaderMenu
                            isAccepted={isAccepted}
                            iBlockedThem={iBlockedThem}
                            onCopyUsername={handleCopyUsername}
                            onReportUser={handleReportUser}
                            onSeverConnection={handleSeverConnection}
                            onBlockUser={handleBlockUser}
                            onUnblockUser={handleUnblockUser}
                        />
                    ),
                }}
            />

            {theyBlockedMe ? (
                <View style={styles.blockedArea}>
                    <Ionicons name="ban" size={48} color="#ff3b30" />
                    <ThemedText style={styles.blockedTitle}>Unavailable</ThemedText>
                    <ThemedText style={styles.blockedSubtitle}>This profile is not available.</ThemedText>
                </View>
            ) : iBlockedThem ? (
                <View style={styles.blockedArea}>
                    <Ionicons name="hand-left" size={48} color={accent} />
                    <ThemedText style={styles.blockedTitle}>You blocked @{displayUsername || 'user'}</ThemedText>
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
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
                >
                    <View style={styles.headerSection}>
                        <View style={styles.topRow}>
                            <View style={[styles.avatarWrapper, { borderColor: isAccepted ? '#4ade80' : glassBorder, display: "flex", alignItems: "center", justifyContent: "center" }]}>
                                <UserAvatar avatar_url={displayAvatarUrl} avatar_config={displayAvatarConfig} size={94} />
                            </View>

                            {/* Solo muestra los stats cuando ya terminó de cargar */}
                            {isAccepted && !loading && (
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

                            {isAccepted && loading && (
                                <View style={styles.statsRow}>
                                    <ActivityIndicator color={accent} size="small" />
                                </View>
                            )}
                        </View>

                        <View style={styles.bioSection}>
                            <ThemedText style={styles.bioText}>
                                {loading && !profile?.description
                                    ? "Loading bio..."
                                    : (profile?.description || "No bio yet.")}
                            </ThemedText>
                        </View>
                    </View>

                    {/* 🛡️ BLOQUEO DE CARGA: Si está cargando, mostramos un loader limpio en lugar de "Connect to Vault" */}
                    {loading ? (
                        <View style={{ paddingVertical: 60, alignItems: 'center' }}>
                            <ActivityIndicator color={accent} size="large" />
                        </View>
                    ) : !isAccepted ? (
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
                                <PostComponent key={post.id} post={post} onCommentPress={() => handleOpenComments(post.id)} />
                            ))}
                        </View>
                    )}
                </ScrollView>
            )}

            <CommentsSheet ref={bottomSheetModalRef} postId={activeCommentPostId} postOwnerId={id} />
        </View>
    );
}