import { chatApi } from "@/api/chat";
import { friendsApi } from "@/api/friends";
import { ThemedText } from "@/components/themed-text";
import UserAvatar from "@/components/UserAvatar";
import { getThemeColor } from "@/constants/theme";
import { Stack, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Platform,
    StyleSheet,
    TouchableOpacity,
    View
} from "react-native";

export default function NewChatModal() {
    const router = useRouter();
    // const [friends, setFriends] = useState<any[]>([]);
    const [filteredFriends, setFilteredFriends] = useState<any[]>([]);
    // true when you have friends but already chat with all of them.
    const [allHaveChat, setAllHaveChat] = useState(false);
    const [loading, setLoading] = useState(true);
    // const [_search, setSearch] = useState("");

    useEffect(() => {
        fetchFriendsForChat();
    }, []);

    const fetchFriendsForChat = async () => {
        try {
            const [allFriends, chatPartnerIds] = await Promise.all([
                friendsApi.getFriendsList(0, 50),
                chatApi.getChatPartnerIds(),
            ]);
            // Only friends you don't have a chat with yet: existing chats are
            // already in the Messages list.
            const withoutChat = allFriends.filter((f: any) => f && !chatPartnerIds.has(f.id));
            // setFriends(withoutChat);
            setFilteredFriends(withoutChat);
            setAllHaveChat(allFriends.length > 0 && withoutChat.length === 0);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    // const handleSearch = (text: string) => {
    //     setSearch(text);
    //     if (text) {
    //         const filtered = friends.filter(f =>
    //             f.username.toLowerCase().includes(text.toLowerCase())
    //         );
    //         setFilteredFriends(filtered);
    //     } else {
    //         setFilteredFriends(friends);
    //     }
    // };

    const startChat = async (friendId: string) => {
        router.back();
        setTimeout(() => {
            router.push({
                pathname: "/chat",
                params: { id: friendId }
            });
        }, 100);
    };

    const header = (
        <Stack.Screen
            options={{
                headerTitle: "New chat",
                headerTitleStyle: { color: getThemeColor("text"), fontWeight: "600" },
                // headerSearchBarOptions: {
                //     placeholder: "Search friends...",
                //     textColor: "#fff",
                //     hintTextColor: "#666",
                //     onChangeText: (event) => handleSearch(event.nativeEvent.text),
                //     onCancelButtonPress: () => setFilteredFriends(friends),
                // },
                headerLeft: () => (
                    <TouchableOpacity onPress={() => router.back()}>
                        <SymbolView name={"xmark"} tintColor={getThemeColor("tint")} />
                    </TouchableOpacity>
                ),
            }}
        />
    );

    if (loading) {
        return (
            <>
                {header}
                <View style={styles.center}>
                    <ActivityIndicator color={getThemeColor("tint")} />
                </View>
            </>
        );
    }

    return (
        <>
            {header}
            <View style={styles.container}>
                <FlatList
                    data={filteredFriends}
                    keyExtractor={(item) => item.id}
                    contentInsetAdjustmentBehavior="automatic"
                    // flexGrow: lets the empty state fill the sheet and sit in the middle.
                    contentContainerStyle={{ flexGrow: 1, paddingTop: Platform.OS === 'android' ? 100 : 0 }}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <SymbolView
                                name={allHaveChat ? "bubble.left.and.bubble.right.fill" : "person.2.fill"}
                                size={44}
                                tintColor={getThemeColor("textSecondary")}
                            />
                            <ThemedText style={styles.emptyTitle}>
                                {allHaveChat ? "No new chats to start" : "No friends yet"}
                            </ThemedText>
                            <ThemedText style={styles.emptyText}>
                                {allHaveChat
                                    ? "You already have a chat with all your friends. You'll find them in Messages."
                                    : "Add friends from Search to start a chat."}
                            </ThemedText>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.friendItem}
                            onPress={() => startChat(item.id)}
                        >
                            <View style={styles.avatarWrapper}>
                                <UserAvatar
                                    avatar_url={item.avatar_url}
                                    avatar_config={item.avatar_config}
                                    size={40}
                                />
                            </View>
                            <View style={styles.info}>
                                <ThemedText style={styles.username}>@{item.username}</ThemedText>
                                <ThemedText style={styles.status}>Available to chat</ThemedText>
                            </View>
                            <SymbolView name="plus.circle.fill" size={20} tintColor={getThemeColor("tint")} />
                        </TouchableOpacity>
                    )}
                />
            </View>
        </>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#000" },
    center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000" },
    friendItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: "#1A1A1A",
    },
    avatarWrapper: {
        width: 40,
        height: 40,
        borderRadius: 20,
        overflow: "hidden",
        backgroundColor: "#161616",
    },
    info: { marginLeft: 12, flex: 1 },
    username: { fontSize: 16, fontWeight: "600", color: "#fff" },
    status: { fontSize: 13, color: "#666" },
    empty: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 40, paddingBottom: 80, gap: 10 },
    emptyTitle: { fontSize: 17, fontWeight: "600", color: "#fff", marginTop: 6 },
    emptyText: { fontSize: 14, color: "#666", textAlign: "center", lineHeight: 20 },
    footerLoader: { paddingVertical: 20, alignItems: "center" }
});