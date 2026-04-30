import { friendsApi } from "@/api/friends";
import CommentsSheet from "@/components/comments-sheet"; // Asegúrate de que el nombre coincida
import PostComponent from "@/components/post";
import { ThemedText } from "@/components/themed-text";
import { ESTILOS_DICEBEAR } from "@/constants/dicebear";
import { getThemeColor } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { createAvatar } from "@dicebear/core";
import { Host } from "@expo/ui/swift-ui"; // Necesario para el Sheet
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { SvgXml } from "react-native-svg";

export default function ProfileScreen() {
    const router = useRouter();
    const [profile, setProfile] = useState<any>(null);
    const [friendsCount, setFriendsCount] = useState(0);
    const [myPosts, setMyPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Lógica para el Sheet de comentarios
    const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
    const [isCommentsOpen, setIsCommentsOpen] = useState(false);

    const accent = getThemeColor('tint');

    const openSettings = () => router.push("/settings");
    const openAvatarSelect = () => router.push("/avatar-select");
    const openFriendsList = () => router.push("/(app)/(tabs)/(profile)/friends");

    const handleOpenComments = (postId: string) => {
        setActiveCommentPostId(postId);
        setIsCommentsOpen(true);
    };

    const loadProfileData = async (showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const [profileRes, count, postsRes] = await Promise.all([
                supabase.from('profiles').select('*').eq('id', user.id).single(),
                friendsApi.getFriendsCount(),
                supabase
                    .from('posts_with_stats')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
            ]);

            if (profileRes.data) setProfile(profileRes.data);
            setFriendsCount(count || 0);
            setMyPosts(postsRes.data || []);
        } catch (error) {
            console.error("Error loading profile:", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadProfileData();
        const channel = supabase
            .channel('my-profile-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => loadProfileData(false))
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadProfileData(false);
        }, [])
    );

    const onRefresh = () => {
        setRefreshing(true);
        loadProfileData(false);
    };

    const userAvatarSvg = useMemo(() => {
        if (!profile?.avatar_config) return null;
        const config = profile.avatar_config;
        const estilo = ESTILOS_DICEBEAR.find(e => e.id === config.styleId) || ESTILOS_DICEBEAR[0];
        return createAvatar(estilo.collection, {
            ...config.options,
            radius: 100,
            scale: 80,
        }).toString();
    }, [profile]);

    if (loading && !refreshing) {
        return (
            <View style={styles.center}>
                <ActivityIndicator color={accent} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
            <Stack.Screen
                options={{
                    headerTitle: profile?.username ? `@${profile.username}` : "Profile",
                    headerLargeTitle: false,
                    headerRight: () => (
                        <TouchableOpacity onPress={openSettings}>
                            <SymbolView name='line.3.horizontal' size={24} tintColor="#fff" />
                        </TouchableOpacity>
                    ),
                    headerShadowVisible: false,
                    headerStyle: { backgroundColor: '#000' },
                    headerTintColor: '#fff',
                    headerTransparent: false,
                }}
            />

            <ScrollView
                style={styles.container}
                contentInsetAdjustmentBehavior="automatic"
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />
                }
            >
                <View style={styles.topContainerMain}>
                    <View style={styles.topContainer}>
                        <TouchableOpacity onPress={openAvatarSelect} style={styles.avatarContainer}>
                            {userAvatarSvg ? (
                                <SvgXml xml={userAvatarSvg} width="88" height="88" />
                            ) : (
                                <View style={styles.avatarPlaceholder} />
                            )}
                        </TouchableOpacity>

                        <View style={styles.statsRow}>
                            <TouchableOpacity style={styles.statItem} onPress={openFriendsList}>
                                <SymbolView name='person.2.fill' size={24} tintColor="#fff" />
                                <ThemedText style={styles.statText}>
                                    {friendsCount} {friendsCount === 1 ? "Friend" : "Friends"}
                                </ThemedText>
                            </TouchableOpacity>

                            <View style={styles.statItem}>
                                <SymbolView name='doc.text.fill' size={24} tintColor="#fff" />
                                <ThemedText style={styles.statText}>
                                    {myPosts.length} {myPosts.length === 1 ? "Post" : "Posts"}
                                </ThemedText>
                            </View>
                        </View>
                    </View>

                    <ThemedText style={styles.bioText}>
                        {profile?.description || "No bio yet."}
                    </ThemedText>
                </View>

                {/* FEED DE MIS PROPIOS POSTS */}
                <View style={styles.myFeed}>
                    {myPosts.map((post) => (
                        <PostComponent
                            post={post}
                            key={post.id}
                            onDelete={() => loadProfileData(false)}
                            // AHORA SÍ: Pasamos la acción para abrir comentarios
                            onCommentPress={() => handleOpenComments(post.id)}
                        />
                    ))}

                    {myPosts.length === 0 && (
                        <View style={styles.emptyContainer}>
                            <SymbolView name="photo.on.rectangle.angled" size={40} tintColor="rgba(255,255,255,0.1)" />
                            <ThemedText style={styles.emptyText}>You haven't posted anything yet.</ThemedText>
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* EL NYMLYSHEET (COMMENTS) */}
            {activeCommentPostId && (
                <Host>
                    <CommentsSheet
                        postId={activeCommentPostId}
                        isPresented={isCommentsOpen}
                        setIsPresented={setIsCommentsOpen}
                        postOwnerId={profile?.id}
                    />
                </Host>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#000" },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
    topContainerMain: { paddingHorizontal: 16, paddingBottom: 24 },
    topContainer: { flexDirection: "row", alignItems: "center", gap: 16 },
    avatarContainer: {
        borderRadius: 44,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: '#161616'
    },
    avatarPlaceholder: { width: 88, height: 88, backgroundColor: '#222' },
    statsRow: { flex: 1, flexDirection: "row", justifyContent: "space-around" },
    statItem: { alignItems: "center" },
    statText: { fontSize: 12, fontWeight: "600", marginTop: 4, color: '#fff' },
    bioText: { marginTop: 20, fontSize: 15, color: "#8A8A8A" },
    myFeed: { paddingBottom: 100, paddingHorizontal: 16 },
    emptyContainer: { alignItems: 'center', marginTop: 50, gap: 10 },
    emptyText: { color: 'rgba(255,255,255,0.3)', fontSize: 14 }
});