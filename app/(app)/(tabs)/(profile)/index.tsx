import { friendsApi } from "@/api/friends";
import CommentsSheet from "@/components/CommentsSheet";
import PostComponent from "@/components/PostComponent";
import { ThemedText } from "@/components/themed-text";
import UserAvatar from "@/components/UserAvatar";
import { getThemeColor } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { Host } from "@expo/ui/swift-ui";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

export default function ProfileScreen() {
    const router = useRouter();
    const [profile, setProfile] = useState<any>(null);
    const [friendsCount, setFriendsCount] = useState(0);
    const [myPosts, setMyPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const commentsRef = useRef<BottomSheetModal>(null);
    const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);

    const accent = getThemeColor('tint');

    const openSettings = () => router.push("/settings");
    const openAvatarSelect = () => router.push("/avatar-select");
    const openFriendsList = () => router.push("/(app)/(tabs)/(profile)/friends");

    const handleOpenComments = (postId: string) => {
        setActiveCommentPostId(postId);
        commentsRef.current?.present();
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
                            <UserAvatar
                                avatar_url={profile?.avatar_url}
                                avatar_config={profile?.avatar_config}
                                size={88}
                            />
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

                <View style={styles.myFeed}>
                    {myPosts.map((post) => (
                        <PostComponent
                            post={post}
                            key={post.id}
                            onDelete={() => loadProfileData(false)}
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

            {activeCommentPostId && (
                <Host>
                    <CommentsSheet
                        ref={commentsRef}
                        postId={activeCommentPostId}
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
    statsRow: { flex: 1, flexDirection: "row", justifyContent: "space-around" },
    statItem: { alignItems: "center" },
    statText: { fontSize: 12, fontWeight: "600", marginTop: 4, color: '#fff' },
    bioText: { marginTop: 20, fontSize: 15, color: "#fff" },
    myFeed: { paddingBottom: 100, paddingHorizontal: 0 },
    emptyContainer: { alignItems: 'center', marginTop: 50, gap: 10 },
    emptyText: { color: 'rgba(255,255,255,0.3)', fontSize: 14 }
});