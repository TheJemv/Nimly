import { friendsApi } from "@/api/friends";
import { ThemedText } from "@/components/themed-text";
import UserAvatar from "@/components/UserAvatar";
import { getThemeColor } from "@/constants/theme";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    TouchableOpacity,
    View
} from "react-native";

const PAGE_SIZE = 20;

export default function FriendsScreen() {
    const router = useRouter();
    const [friends, setFriends] = useState<any[]>([]);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    const fetchFriends = async (pageToLoad: number, isRefreshing: boolean = false) => {
        try {
            const newFriends = await friendsApi.getFriendsList(pageToLoad, PAGE_SIZE);

            if (isRefreshing) {
                setFriends(newFriends);
            } else {
                setFriends(prev => [...prev, ...newFriends]);
            }

            if (newFriends.length < PAGE_SIZE) {
                setHasMore(false);
            } else {
                setHasMore(true);
            }
        } catch (error) {
            console.error("Error loading friends:", error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchFriends(0, true);
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        setPage(0);
        fetchFriends(0, true);
    };

    const loadMore = () => {
        if (!loadingMore && hasMore) {
            setLoadingMore(true);
            const nextPage = page + 1;
            setPage(nextPage);
            fetchFriends(nextPage);
        }
    };

    const renderFooter = () => {
        if (!loadingMore) return <View style={{ height: 40 }} />;
        return (
            <View style={styles.footerLoader}>
                <ActivityIndicator color={getThemeColor("tint")} />
            </View>
        );
    };

    if (loading && !refreshing) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={getThemeColor("tint")} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={friends}
                keyExtractor={(item, index) => `${item.id}-${index}`}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={getThemeColor("tint")} />
                }
                onEndReached={loadMore}
                onEndReachedThreshold={0.5}
                ListFooterComponent={renderFooter}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <ThemedText style={styles.emptyText}>No friends found.</ThemedText>
                    </View>
                }
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={styles.friendItem}
                        onPress={() => router.push(`/(app)/user/${item.id}`)}
                    >
                        <View style={styles.avatarWrapper}>
                            <UserAvatar avatar_url={item.avatar_url} avatar_config={item.avatar_config} size={48} />
                        </View>
                        <View style={styles.info}>
                            <ThemedText style={styles.username}>@{item.username}</ThemedText>
                            <ThemedText style={styles.status}>Friend since recently</ThemedText>
                        </View>
                        <SymbolView name="chevron.right" size={14} tintColor="#333" />
                    </TouchableOpacity>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#000" },
    center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000" },
    friendItem: {
        flexDirection: "row",
        alignItems: "center",
        padding: 16,
        borderBottomWidth: 0.5,
        borderBottomColor: "#1A1A1A",
    },
    avatarWrapper: {
        width: 48,
        height: 48,
        borderRadius: 24,
        overflow: "hidden",
        backgroundColor: "#161616",
        borderWidth: 1,
        borderColor: "#333",
    },
    info: { marginLeft: 12, flex: 1 },
    username: { fontSize: 16, fontWeight: "bold", color: "#fff" },
    status: { fontSize: 13, color: "#666", marginTop: 2 },
    emptyContainer: { padding: 40, alignItems: "center" },
    emptyText: { color: "#666", fontSize: 15 },
    footerLoader: { paddingVertical: 20, alignItems: "center" }
});