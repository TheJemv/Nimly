import { getThemeColor } from '@/constants/theme';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
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
                <Animated.FlatList
                    data={chats}
                    keyExtractor={(item) => item.chat_id}
                    // Anima el reordenamiento cuando un chat sube por un mensaje nuevo.
                    itemLayoutAnimation={LinearTransition.duration(320)}
                    renderItem={({ item }) => (
                        <Animated.View entering={FadeIn.duration(200)}>
                            <ChatCard
                                item={item}
                                myId={myId}
                            />
                        </Animated.View>
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