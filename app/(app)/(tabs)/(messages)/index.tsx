import { ESTILOS_DICEBEAR } from "@/constants/dicebear";
import { getThemeColor } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { vaultCrypto, vaultRAMCache } from "@/utils/crypto"; // IMPORTAMOS LA CACHÉ
import { createAvatar } from "@dicebear/core";
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SvgXml } from "react-native-svg";

const formatTime = (dateString: string) => {
  const now = new Date();
  const date = new Date(dateString);
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffInSeconds < 60) return 'Just now';
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const ChatAvatar = ({ config }: { config: any }) => {
  const svg = useMemo(() => {
    if (!config) return null;
    const estilo = ESTILOS_DICEBEAR.find(e => e.id === config.styleId) || ESTILOS_DICEBEAR[0];
    return createAvatar(estilo.collection, { ...config.options, radius: 50 }).toString();
  }, [config]);
  if (!svg) return <View style={styles.avatarPlaceholder} />;
  return <SvgXml xml={svg} width="56" height="56" />;
};

// --- COMPONENTE EXTRAÍDO Y BLINDADO ---
const LastMessageContent = memo(({ content, friendPublicKey, isMine, type }: { content: string, friendPublicKey: string, isMine: boolean, type?: string }) => {
  // Manejo de cápsulas multimedia
  if (type === 'image' || type === 'image-view-once') {
    return (
      <Text style={[styles.lastMessage, isMine && { color: '#bbb' }]} numberOfLines={1}>
        {isMine ? 'You: ' : ''}📷 Multimedia Capsule
      </Text>
    );
  }

  // Lectura desde RAM Cache para velocidad extrema
  const initialText = vaultRAMCache[content] && !vaultRAMCache[content].startsWith("🔒")
    ? vaultRAMCache[content]
    : "🔒 Decrypting...";

  const [decryptedText, setDecryptedText] = useState(initialText);

  useEffect(() => {
    if (!friendPublicKey) {
      setDecryptedText("🔒 Syncing Vault...");
      return;
    }

    if (vaultRAMCache[content] && !vaultRAMCache[content].startsWith("🔒")) return;

    let isMounted = true;
    const decrypt = async () => {
      try {
        // AHORA SÍ PASAMOS LA LLAVE PÚBLICA
        const clearText = await vaultCrypto.decryptMessage(content, friendPublicKey);
        if (isMounted) {
          if (!clearText.startsWith("🔒")) {
            vaultRAMCache[content] = clearText;
          }
          setDecryptedText(clearText);
        }
      } catch (e) {
        if (isMounted) setDecryptedText("🔒 Error");
      }
    };
    decrypt();
    return () => { isMounted = false; };
  }, [content, friendPublicKey]);

  return (
    <Text style={[styles.lastMessage, isMine && { color: '#bbb' }]} numberOfLines={1}>
      {isMine ? 'You: ' : ''}{decryptedText}
    </Text>
  );
});

export default function MessagesScreen() {
  const router = useRouter();
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);

  useEffect(() => {
    fetchChats();
    const channel = supabase
      .channel('list_updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => fetchChats(false))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchChats = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setMyId(user.id);

      const { data, error } = await supabase
        .from('chat_participants')
        .select(`
            chat_id,
            chats (
                id,
                created_at,
                messages (content, created_at, sender_id, type) 
            ),
            profiles:user_id (id, username, avatar_config, public_key) 
        `) // <-- AGREGAMOS TYPE Y PUBLIC_KEY A LA CONSULTA
        .neq('user_id', user.id);

      if (error) throw error;

      const sorted = (data || []).sort((a: any, b: any) => {
        const dateA = a.chats?.messages?.[0]?.created_at || a.chats?.created_at;
        const dateB = b.chats?.messages?.[0]?.created_at || b.chats?.created_at;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
      setChats(sorted);
    } catch (e) { console.error(e); } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const renderChatItem = ({ item }: { item: any }) => {
    const messages = item.chats?.messages || [];
    const lastMsg = messages[messages.length - 1];
    const isMine = lastMsg?.sender_id === myId;

    return (
      <TouchableOpacity
        style={styles.chatCard}
        onPress={() => router.push({ pathname: "/chat", params: { id: item.profiles?.id } })}
        activeOpacity={0.6}
      >
        <View style={styles.avatarWrapper}>
          <ChatAvatar config={item.profiles?.avatar_config} />
        </View>

        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={styles.username}>@{item.profiles?.username}</Text>
            <View style={styles.timeWrapper}>
              <Text style={styles.timeText}>{lastMsg ? formatTime(lastMsg.created_at) : ''}</Text>
              <SymbolView name="chevron.right" size={10} tintColor="#333" />
            </View>
          </View>

          {lastMsg ? (
            <LastMessageContent
              content={lastMsg.content}
              friendPublicKey={item.profiles?.public_key} // <-- LE PASAMOS LA LLAVE AQUÍ
              isMine={isMine}
              type={lastMsg.type} // <-- LE PASAMOS EL TIPO PARA LAS FOTOS
            />
          ) : (
            <Text style={styles.lastMessage}>No messages yet</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        headerTitle: "Messages",
        headerLargeTitle: true,
        headerTransparent: true,
        headerLargeTitleStyle: { color: '#fff' },
        headerRight: () => (
          <TouchableOpacity onPress={() => router.push("/(app)/(tabs)/(messages)/friends")} >
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
          renderItem={renderChatItem}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchChats(false); }} tintColor={getThemeColor('tint')} />}
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>No conversations</Text></View>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  chatCard: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center' },
  avatarWrapper: { width: 56, height: 56, borderRadius: 28, overflow: 'hidden', backgroundColor: '#111' },
  avatarPlaceholder: { width: 56, height: 56, backgroundColor: '#111' },
  chatInfo: { flex: 1, marginLeft: 14, borderBottomWidth: 0.2, borderBottomColor: '#222', paddingBottom: 12 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  username: { fontSize: 16, fontWeight: '600', color: '#fff' },
  timeWrapper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeText: { fontSize: 13, color: '#666' },
  lastMessage: { fontSize: 14, color: '#888', lineHeight: 18 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', marginTop: 100 },
  emptyText: { color: '#444', fontSize: 15 },
});