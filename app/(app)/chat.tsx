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
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
   ActivityIndicator,
   Alert,
   FlatList,
   KeyboardAvoidingView,
   Platform,
   StyleSheet,
   Text,
   TextInput,
   TouchableOpacity,
   View
} from "react-native";
import { SvgXml } from "react-native-svg";

import MediaMessageBubble from "@/components/MediaMessageBubble";
import { MessageContent } from "@/components/MessageContent";
import NymlyCamera from "@/components/NymlyCamera";
import { useChatMedia } from "@/hooks/useChatMedia";
import { useChatSync } from "@/hooks/useChatSync";
import { cleanChatMessage } from "@/utils/chatUtils";

export default function ChatScreen() {
   const { id: targetFriendId } = useLocalSearchParams<{ id: string }>();
   const router = useRouter();

   const [newMessage, setNewMessage] = useState("");
   const [isCameraVisible, setCameraVisible] = useState(false);

   const {
      chatId,
      messages,
      setMessages,
      loading,
      loadingMore,
      hasMore,
      friendProfile,
      currentUserId,
      loadMoreMessages
   } = useChatSync(targetFriendId);

   const { sendCapturedImage, isUploading } = useChatMedia(chatId || '', currentUserId || '');

   // Prefetching de media
   useEffect(() => {
      if (!friendProfile?.public_key || messages.length === 0) return;
      const mediaItems = messages
         .filter(m => m.type === 'image' && m.content && m.content !== 'OPENED_CAPSULE')
         .map(m => ({ filePath: m.content, friendPublicKey: friendProfile.public_key }));

      if (mediaItems.length > 0) prefetchChatMedia(mediaItems);
   }, [messages, friendProfile?.public_key]);

   const lastReadMessageId = useMemo(() => {
      if (!currentUserId) return null;
      const lastRead = messages.find(m => m.sender_id === currentUserId && m.is_read === true);
      return lastRead ? lastRead.id : null;
   }, [messages, currentUserId]);

   const handleSendText = async () => {
      const cleanedMessage = cleanChatMessage(newMessage);
      if (!cleanedMessage || !chatId || !currentUserId || !friendProfile?.public_key) return;

      setNewMessage("");

      try {
         const encryptedContent = await vaultCrypto.encryptMessage(cleanedMessage, friendProfile.public_key);
         if (!encryptedContent) throw new Error("Encryption failed");

         vaultRAMCache[encryptedContent] = cleanedMessage;

         await supabase.from('messages').insert({
            chat_id: chatId,
            sender_id: currentUserId,
            content: encryptedContent,
            type: 'text',
            is_read: false
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
      const showReadReceipt = item.id === lastReadMessageId;

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
         "Are you sure? This will permanently destroy all messages and media for both of you.",
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
   rowContainer: { width: '100%', marginBottom: 14, position: 'relative' },
   bubble: { maxWidth: '80%', padding: 12, borderRadius: 20 },
   bubbleImage: { maxWidth: '80%', padding: 0, borderRadius: 20 },
   myBubble: { alignSelf: 'flex-end', backgroundColor: getThemeColor("tint") },
   theirBubble: { alignSelf: 'flex-start', backgroundColor: '#1C1C1E' },
   readReceiptContainer: {
      position: 'absolute',
      right: 0,
      bottom: -12,
      width: 16,
      height: 16,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: '#000',
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
      width: 44, height: 44, borderRadius: 22,
      justifyContent: "center", alignItems: "center",
      overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)'
   },
   input: {
      flex: 1, backgroundColor: '#1C1C1E', borderRadius: 20,
      color: "#fff", padding: 12, paddingHorizontal: 16
   },
   sendButton: { height: 44, width: 44, justifyContent: 'center', alignItems: 'center' },
   uploadIndicator: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingVertical: 5, backgroundColor: '#111', gap: 8
   },
   uploadText: { color: '#fff', fontSize: 12, fontWeight: '600' }
});