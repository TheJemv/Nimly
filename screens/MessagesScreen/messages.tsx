import { getThemeColor } from '@/constants/theme';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import ChatCard from "./components/ChatCard";
import { useChatsList } from "./hooks";
import { styles } from "./messages.styles";

export default function MessagesScreen() {
    const router = useRouter();
    const { chats, loading, refreshing, myId, onRefresh } = useChatsList();

    return (
        <View style={styles.container}>
            <Stack.Screen options={{
                headerTitle: "Messages",
                headerLargeTitle: true,
                headerTransparent: true,
                headerLargeTitleStyle: { color: getThemeColor("text") },
                headerRight: () => (
                    <TouchableOpacity onPress={() => router.push("/(app)/(tabs)/(messages)/friends")}>
                        <SymbolView name="plus" size={24} tintColor={getThemeColor('tint')} />
                    </TouchableOpacity>
                )
            }} />

            {loading && !refreshing ? (
                <View style={styles.center}><ActivityIndicator color={getThemeColor('tint')} /></View>
            ) : (
                <FlatList
                    data={chats}
                    keyExtractor={(item) => item.chat_id}
                    renderItem={({ item }) => (
                        <ChatCard
                            item={item}
                            myId={myId}
                            onPress={() => router.push({ pathname: "/chat", params: { id: item.profiles?.id } })}
                        />
                    )}
                    contentInsetAdjustmentBehavior="automatic"
                    contentContainerStyle={{ paddingBottom: 100 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={getThemeColor('tint')} />}
                    ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>No conversations</Text></View>}
                />
            )}
        </View>
    );
}