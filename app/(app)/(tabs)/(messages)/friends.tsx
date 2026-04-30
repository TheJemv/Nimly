import { friendsApi } from "@/api/friends";
import { ThemedText } from "@/components/themed-text";
import { ESTILOS_DICEBEAR } from "@/constants/dicebear";
import { getThemeColor } from "@/constants/theme";
import { createAvatar } from "@dicebear/core";
import { Stack, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Platform,
    StyleSheet,
    TouchableOpacity,
    View
} from "react-native";
import { SvgXml } from "react-native-svg";

const FriendAvatar = ({ config }: { config: any }) => {
    const svg = useMemo(() => {
        if (!config) return null;
        const estilo = ESTILOS_DICEBEAR.find(e => e.id === config.styleId) || ESTILOS_DICEBEAR[0];
        return createAvatar(estilo.collection, {
            ...config.options,
            radius: 100,
        }).toString();
    }, [config]);

    if (!svg) return <View style={styles.avatarPlaceholder} />;
    return <SvgXml xml={svg} width="40" height="40" />;
};

export default function NewChatModal() {
    const router = useRouter();
    const [friends, setFriends] = useState<any[]>([]);
    const [filteredFriends, setFilteredFriends] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        fetchFriendsForChat();
    }, []);

    const fetchFriendsForChat = async () => {
        try {
            // 1. Traemos la lista de amigos
            const allFriends = await friendsApi.getFriendsList(0, 50);

            // 2. (Opcional) Aquí podrías filtrar si ya existe un chat con ellos
            // Por ahora mostramos todos para que puedas probar la navegación
            setFriends(allFriends);
            setFilteredFriends(allFriends);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    // Lógica de búsqueda
    const handleSearch = (text: string) => {
        setSearch(text);
        if (text) {
            const filtered = friends.filter(f =>
                f.username.toLowerCase().includes(text.toLowerCase())
            );
            setFilteredFriends(filtered);
        } else {
            setFilteredFriends(friends);
        }
    };

    const startChat = async (friendId: string) => {
        // 1. Primero cerramos el modal actual
        router.back();

        // 2. Usamos un pequeño delay (mínimo) para que el modal empiece a bajar
        // y no bloquee la transición visual del push
        setTimeout(() => {
            router.push({
                pathname: "/chat",
                params: { id: friendId }
            });
        }, 100);
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator color={getThemeColor("tint")} />
            </View>
        );
    }

    return (
        <>
            <Stack.Screen
                options={{
                    headerSearchBarOptions: {
                        placeholder: "Search friends...",
                        textColor: "#fff",
                        hintTextColor: "#666",
                        onChangeText: (event) => handleSearch(event.nativeEvent.text),
                        onCancelButtonPress: () => setFilteredFriends(friends),
                    },
                    headerLeft: () => (
                        <TouchableOpacity onPress={() => router.back()}>
                            <SymbolView name={"xmark"} tintColor={getThemeColor("tint")} />
                        </TouchableOpacity>
                    ),
                }}
            />
            <View style={styles.container}>
                <FlatList
                    data={filteredFriends}
                    keyExtractor={(item) => item.id}
                    contentInsetAdjustmentBehavior="automatic" // Esto es clave para el Large Title + SearchBar
                    contentContainerStyle={{ paddingTop: Platform.OS === 'android' ? 100 : 0 }}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <ThemedText style={styles.emptyText}>No friends found</ThemedText>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.friendItem}
                            onPress={() => startChat(item.id)}
                        >
                            <View style={styles.avatarWrapper}>
                                <FriendAvatar config={item.avatar_config} />
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
    avatarPlaceholder: { width: 40, height: 40, backgroundColor: "#222" },
    info: { marginLeft: 12, flex: 1 },
    username: { fontSize: 16, fontWeight: "600", color: "#fff" },
    status: { fontSize: 13, color: "#666" },
    empty: { padding: 40, alignItems: "center" },
    emptyText: { color: "#666" },
    footerLoader: { paddingVertical: 20, alignItems: "center" }
});