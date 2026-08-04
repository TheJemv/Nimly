import { chatApi } from "@/api/chat";
import { ESTILOS_DICEBEAR } from "@/constants/dicebear";
import { getThemeColor } from "@/constants/theme";
import { supabase } from "@/lib/supabase";

import { vaultCrypto, vaultRAMCache } from "@/utils/crypto";
import { prefetchChatMedia } from "@/utils/mediaPrefetch";

import { createAvatar } from "@dicebear/core";
import { Button, ContextMenu, Host, Image as SwiftImage } from "@expo/ui/swift-ui";
import { GlassView } from "expo-glass-effect";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
   ActivityIndicator,
   Alert,
   FlatList,
   KeyboardAvoidingView,
   LayoutAnimation,
   Platform,
   StyleSheet,
   Text,
   TextInput,
   TouchableOpacity,
   UIManager,
   View
} from "react-native";
import { SvgXml } from "react-native-svg";

import MediaMessageBubble from "@/components/MediaMessageBubble";
import NymlyCamera from "@/components/NymlyCamera";
import { useChatMedia } from "@/hooks/useChatMedia";
import { cleanChatMessage } from "@/utils/chatUtils";

// Habilitar LayoutAnimation en Android por si acaso, aunque sea solo iOS
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
   UIManager.setLayoutAnimationEnabledExperimental(true);
}

const PAGE_SIZE = 30;

const MessageContent = memo(({ content, friendPublicKey }: { content: string; friendPublicKey: string | undefined }) => {
   const initialText = vaultRAMCache[content] && !vaultRAMCache[content].startsWith("🔒")
      ? vaultRAMCache[content]
      : "🔒 Decrypting...";

   const [decryptedText, setDecryptedText] = useState(initialText);

   useEffect(() => {
      if (!friendPublicKey) {
         setDecryptedText("🔒 Connecting Vault...");
         return;
      }

      if (vaultRAMCache[content] && !vaultRAMCache[content].startsWith("🔒")) return;

      let isMounted = true;
      const decrypt = async () => {
         try {
            const clearText = await vaultCrypto.decryptMessage(content, friendPublicKey);
            if (isMounted) {
               if (!clearText.startsWith("🔒")) {
                  vaultRAMCache[content] = clearText;
               }
               setDecryptedText(clearText);
            }
         } catch (e) {
            if (isMounted) setDecryptedText("🔒 Locked Capsule");
         }
      };

      decrypt();
      return () => { isMounted = false; };
   }, [content, friendPublicKey]);

   return <Text style={styles.messageText}>{decryptedText}</Text>;
});

export default function ChatScreen() {
   const { id: targetFriendId } = useLocalSearchParams<{ id: string }>();
   const router = useRouter();

   // Estados de infraestructura
   const [chatId, setChatId] = useState<string | null>(null);
   const [messages, setMessages] = useState<any[]>([]);
   const [newMessage, setNewMessage] = useState("");
   const [loading, setLoading] = useState(true);
   const [loadingMore, setLoadingMore] = useState(false);
   const [hasMore, setHasMore] = useState(true);
   const [friendProfile, setFriendProfile] = useState<any>(null);
   const [currentUserId, setCurrentUserId] = useState<string | null>(null);
   const [isCameraVisible, setCameraVisible] = useState(false);

   const { sendCapturedImage, isUploading } = useChatMedia(chatId || '', currentUserId || '');

   // Función para marcar como leídos los mensajes que nos envió nuestro amigo
   const markMessagesAsRead = useCallback(async (cId: string) => {
      if (!targetFriendId) return;
      // Invocación directa a la infraestructura del chatApi
      await chatApi.markAsRead(cId, targetFriendId);
   }, [targetFriendId]);

   // Calculamos el ID del último mensaje que mi amigo leyó (enviado por mí)
   const lastReadMessageId = useMemo(() => {
      if (!currentUserId) return null;
      // Al estar invertida la lista, el primero que cumpla la condición desde el principio ([0] hacia arriba)
      // es técnicamente el más reciente de forma cronológica en base al orden devuelto por la base de datos.
      const lastRead = messages.find(m => m.sender_id === currentUserId && m.is_read === true);
      return lastRead ? lastRead.id : null;
   }, [messages, currentUserId]);

   useEffect(() => {
      let channel: any;
      const init = async () => {
         if (!targetFriendId || targetFriendId === "[id]") return;
         try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setCurrentUserId(user.id);

            const cId = await chatApi.getOrCreateChat(targetFriendId);
            if (!cId) return;
            setChatId(cId);

            // 1. Antes de traerlos o justo al iniciar, marcamos lo que tenemos pendiente de leer
            await markMessagesAsRead(cId);

            const [msgRes, profRes] = await Promise.all([
               fetchMessages(cId, 0),
               supabase.from('profiles').select('*').eq('id', targetFriendId).single()
            ]);

            if (profRes.data) {
               setFriendProfile(profRes.data);
            }

            // Realtime configurado para escuchar INSERTS y UPDATES (cuando cambien a is_read = true)
            channel = supabase.channel(`chat:${cId}`)
               .on('postgres_changes',
                  { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${cId}` },
                  (p) => {
                     // Configurar animación nativa limpia para el cambio de UI
                     LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

                     if (p.eventType === 'INSERT') {
                        // Si el mensaje entrante es de mi amigo y estoy dentro del chat, lo marco leído de inmediato
                        if (p.new.sender_id === targetFriendId) {
                           markMessagesAsRead(cId);
                           p.new.is_read = true;
                        }
                        setMessages(prev => [p.new, ...prev]);
                     }
                     else if (p.eventType === 'UPDATE') {
                        // Si se actualizó el estado de lectura de un mensaje, reemplazamos el mensaje local
                        setMessages(prev => prev.map(m => m.id === p.new.id ? p.new : m));
                     }
                  }
               )
               .subscribe();
         } catch (e) {
            console.error("❌ [INIT] Chat Init Error:", e);
         } finally {
            setLoading(false);
         }
      };
      init();
      return () => { if (channel) supabase.removeChannel(channel); };
   }, [targetFriendId, markMessagesAsRead]);

   useEffect(() => {
      if (!friendProfile?.public_key || messages.length === 0) return;

      const mediaItems = messages
         .filter(m => m.type === 'image' && m.content && m.content !== 'OPENED_CAPSULE')
         .map(m => ({ filePath: m.content, friendPublicKey: friendProfile.public_key }));

      if (mediaItems.length > 0) {
         prefetchChatMedia(mediaItems);
      }
   }, [messages, friendProfile?.public_key]);

   const fetchMessages = async (cId: string, offset: number) => {
      try {
         const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('chat_id', cId)
            .order('created_at', { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1);

         if (error) throw error;
         if (data && data.length < PAGE_SIZE) setHasMore(false);
         if (offset === 0) setMessages(data || []);
         else setMessages(prev => [...prev, ...(data || [])]);
         return data;
      } catch (e) {
         console.error('❌ [FETCH] Error:', e);
      }
   };

   const loadMoreMessages = async () => {
      if (loadingMore || !hasMore || !chatId) return;
      setLoadingMore(true);
      try { await fetchMessages(chatId, messages.length); }
      catch (e) { console.error(e); }
      finally { setLoadingMore(false); }
   };

   const handleSendText = async () => {
      const cleanedMessage = cleanChatMessage(newMessage);
      if (!cleanedMessage || !chatId || !currentUserId) return;
      if (!friendProfile?.public_key) {
         alert("Connecting Vault. Please wait a second.");
         return;
      }

      setNewMessage("");

      try {
         const encryptedContent = await vaultCrypto.encryptMessage(cleanedMessage, friendProfile.public_key);
         if (!encryptedContent) throw new Error("Encryption failed");

         await supabase.from('messages').insert({
            chat_id: chatId,
            sender_id: currentUserId,
            content: encryptedContent,
            type: 'text',
            is_read: false // Mensaje nuevo nace sin leer
         });
      } catch (e) {
         console.error("❌ [SEND] Vault Send Error:", e);
      }
   };

   const friendAvatarSvg = useMemo(() => {
      if (!friendProfile?.avatar_config) return null;
      const config = friendProfile.avatar_config;
      const estilo = ESTILOS_DICEBEAR.find(e => e.id === config.styleId) || ESTILOS_DICEBEAR[0];
      return createAvatar(estilo.collection, { ...config.options, radius: 50 }).toString();
   }, [friendProfile]);

   const renderItem = useCallback(({ item }: { item: any }) => {
      const mine = item.sender_id === currentUserId;
      const keyToUse = friendProfile?.public_key || "";
      const showReadReceipt = item.id === lastReadMessageId; // ¿Es este el último mensaje leído por el amigo?

      if (item.content === 'OPENED_CAPSULE') {
         return (
            <View style={styles.rowContainer}>
               <View style={[styles.bubble, mine ? styles.myBubble : styles.theirBubble]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
                     <SymbolView name="eye.slash.fill" size={14} tintColor="#888" />
                     <Text style={{ color: '#888', fontStyle: 'italic', fontSize: 14 }}>Opened Capsule</Text>
                  </View>
               </View>
               {showReadReceipt && friendAvatarSvg && (
                  <View style={styles.readReceiptContainer}>
                     <SvgXml xml={friendAvatarSvg} width="16" height="16" />
                  </View>
               )}
            </View>
         );
      }

      const isText = item.type === 'text' || !item.type;
      const isViewOnceSender = item.type === 'image-view-once' && mine;

      return (
         <View style={styles.rowContainer}>
            <View style={[
               (isText || isViewOnceSender) ? styles.bubble : styles.bubbleImage,
               mine ? styles.myBubble : styles.theirBubble
            ]}>
               {isText ? (
                  <MessageContent content={item.content} friendPublicKey={keyToUse} />
               ) : (
                  <MediaMessageBubble
                     filePath={item.content}
                     friendPublicKey={keyToUse}
                     isViewOnce={item.type === 'image-view-once'}
                     isMine={mine}
                  />
               )}
            </View>
            {/* Si es el último leído, renderizamos el indicador alineado de forma absoluta a la derecha de la fila */}
            {showReadReceipt && friendAvatarSvg && (
               <View style={styles.readReceiptContainer}>
                  <SvgXml xml={friendAvatarSvg} width="16" height="16" />
               </View>
            )}
         </View>
      );
   }, [currentUserId, friendProfile, lastReadMessageId, friendAvatarSvg]);

   const handleBurnHistory = () => {
      if (!chatId) return;

      Alert.alert(
         "Burn Chat History",
         "Are you sure? This will permanently destroy all messages and media for both of you. This mathematical action cannot be undone.",
         [
            { text: "Cancel", style: "cancel" },
            {
               text: "Burn it",
               style: "destructive",
               onPress: async () => {
                  try {
                     await chatApi.burnChatHistory(chatId);
                     setMessages([]);
                  } catch (e) {
                     alert("Failed to burn history.");
                  }
               }
            }
         ]
      );
   };

   if (loading) return <View style={styles.center}><ActivityIndicator color={getThemeColor("tint")} /></View>;

   return (
      <>
         <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.container}
            keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
         >
            <Stack.Screen
               options={{
                  headerStyle: { backgroundColor: '#000' },
                  headerShadowVisible: false,
                  headerTitle: () => (
                     <TouchableOpacity style={styles.headerBtn} onPress={() => router.push(`/(app)/user/${targetFriendId}`)}>
                        <View style={styles.headerAvatar}>
                           {friendAvatarSvg && <SvgXml xml={friendAvatarSvg} width="32" height="32" />}
                        </View>
                        <View>
                           <Text style={styles.headerName}>@{friendProfile?.username || 'User'}</Text>
                           <Text style={styles.headerSub}>View Profile</Text>
                        </View>
                     </TouchableOpacity>
                  ),
                  headerRight: () => (
                     <Host style={{ width: 35, height: 35 }}>
                        <ContextMenu>
                           <ContextMenu.Items>
                              <Button systemImage="bell.slash" label="Mute Notifications" onPress={() => { }} />
                              <Button systemImage="trash" label="Delete Chat" role="destructive" onPress={handleBurnHistory} />
                           </ContextMenu.Items>
                           <ContextMenu.Trigger>
                              <SwiftImage systemName="ellipsis" />
                           </ContextMenu.Trigger>
                        </ContextMenu>
                     </Host>
                  )
               }}
            />

            <FlatList
               inverted
               data={messages}
               keyExtractor={(item) => item.id}
               renderItem={renderItem}
               onEndReached={loadMoreMessages}
               onEndReachedThreshold={0.2}
               contentContainerStyle={{ padding: 16 }}
               removeClippedSubviews={Platform.OS === 'android'}
               maxToRenderPerBatch={10}
               windowSize={5}
               ListFooterComponent={() => loadingMore ? <ActivityIndicator style={{ margin: 10 }} /> : null}
            />

            {isUploading && (
               <View style={styles.uploadIndicator}>
                  <ActivityIndicator size="small" color={getThemeColor("tint")} />
                  <Text style={styles.uploadText}>Encrypting Vault...</Text>
               </View>
            )}

            <View style={styles.inputBar}>
               <TouchableOpacity style={styles.plusHost} onPress={() => setCameraVisible(true)}>
                  <GlassView style={styles.plusButton}>
                     <SymbolView name="camera" size={22} tintColor={getThemeColor("tint")} />
                  </GlassView>
               </TouchableOpacity>

               <TextInput
                  style={styles.input}
                  placeholder="Message..."
                  placeholderTextColor="#666"
                  value={newMessage}
                  onChangeText={setNewMessage}
                  multiline
                  selectionColor={getThemeColor("tint")}
               />

               <TouchableOpacity
                  style={styles.sendButton}
                  onPress={handleSendText}
                  disabled={!newMessage.trim()}
               >
                  <SymbolView
                     name="arrow.up.circle.fill"
                     size={48}
                     tintColor={newMessage.trim() ? getThemeColor("tint") : "#333"}
                  />
               </TouchableOpacity>
            </View>
         </KeyboardAvoidingView>

         <NymlyCamera
            visible={isCameraVisible}
            onClose={() => setCameraVisible(false)}
            onSend={(uri, type, option) => {
               if (friendProfile?.public_key) {
                  // Si eligió view-once, usamos esa opción; si no, el tipo regular ('image' o 'video')
                  const finalType = option || type;
                  sendCapturedImage(uri, finalType, friendProfile.public_key);
               } else {
                  alert("Connecting Vault. Please wait a second.");
               }
            }}
         />
      </>
   );
}

const styles = StyleSheet.create({
   container: { flex: 1, backgroundColor: "#000" },
   center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
   headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 10 },
   headerAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#111', overflow: 'hidden' },
   headerName: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
   headerSub: { color: '#666', fontSize: 10 },

   // Contenedor por cada fila de mensaje para alinear el indicador
   rowContainer: {
      width: '100%',
      marginBottom: 14,          // Espaciado balanceado para alojar el avatar flotante sin colisiones
      position: 'relative',
   },
   bubble: { maxWidth: '80%', padding: 12, borderRadius: 20 },
   bubbleImage: { maxWidth: '80%', padding: 0, borderRadius: 20 },
   myBubble: { alignSelf: 'flex-end', backgroundColor: getThemeColor("tint") },
   theirBubble: { alignSelf: 'flex-start', backgroundColor: '#1C1C1E' },
   messageText: { color: '#fff', fontSize: 16 },

   // Mini avatar indicador de visto (estilo quiet luxury - Posicionamiento Absoluto Extremo Derecho)
   readReceiptContainer: {
      position: 'absolute',
      right: 0,                   // Alineado de forma fija al borde derecho de la pantalla
      bottom: -12,                // Lo baja ligeramente de la base de la burbuja para un efecto flotante limpio
      width: 16,
      height: 16,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: '#000',    // Fondo negro sólido para ocultar bordes de la lista de forma estética
   },

   inputBar: {
      flexDirection: 'row',
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: Platform.OS === 'ios' ? 35 : 15,
      alignItems: 'center',
      backgroundColor: '#000',
      borderTopWidth: 0.5,
      borderTopColor: '#222',
      gap: 8
   },
   plusHost: { width: 44, height: 44, marginBottom: 2 },
   plusButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: "center",
      alignItems: "center",
      overflow: 'hidden',
      backgroundColor: 'rgba(255,255,255,0.05)'
   },
   input: {
      flex: 1,
      backgroundColor: '#1C1C1E',
      borderRadius: 20,
      color: "#fff",
      padding: 12,
      paddingHorizontal: 16
   },
   sendButton: {
      height: 44, width: 44,
      justifyContent: 'center', alignItems: 'center'
   },
   uploadIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 5,
      backgroundColor: '#111',
      gap: 8
   },
   uploadText: { color: '#fff', fontSize: 12, fontWeight: '600' }
});