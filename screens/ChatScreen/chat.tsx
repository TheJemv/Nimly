import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
   ActivityIndicator,
   Alert,
   FlatList,
   KeyboardAvoidingView,
   Platform,
   Text,
   TextInput,
   TouchableOpacity,
   View
} from "react-native";

// Expo
import { Button, ContextMenu, Host, Image as SwiftImage } from "@expo/ui/swift-ui";
import { GlassView } from "expo-glass-effect";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";

// Constants
import { getThemeColor } from "@/constants/theme";

// Components
import MediaMessageBubble from "@/components/MediaMessageBubble";
import { MessageContent } from "@/components/MessageContent";
import NymlyCamera from "@/components/NymlyCamera";
import { ReplyStory } from "@/components/ReplyStory";
import UserAvatar from "@/components/UserAvatar";

// Utils
import { cleanChatMessage } from "@/utils/chatUtils";
import { vaultCrypto, vaultRAMCache } from "@/utils/crypto";
import { prefetchChatMedia } from "@/utils/mediaPrefetch";

// More
import { chatApi } from "@/api/chat";
import { supabase } from "@/lib/supabase";
import { styles } from "./chat.styles";
import { useChatMedia, useChatSync } from "./hooks";

export default function ChatScreen() {
   const { id: targetFriendId, user: routeUserParam } = useLocalSearchParams<{ id: string; user?: string }>();
   const router = useRouter();

   const [newMessage, setNewMessage] = useState("");
   const [isCameraVisible, setCameraVisible] = useState(false);
   const [replyingTo, setReplyingTo] = useState<any>(null);

   const {
      chatId,
      messages,
      setMessages,
      loading,
      loadingMore,
      hasMore,
      friendProfile,
      friendKeyChanged,
      currentUserId,
      loadMoreMessages
   } = useChatSync(targetFriendId);

   const { sendCapturedImage, isUploading } = useChatMedia(chatId || '', currentUserId || '');

   // Parsear el objeto user que viene por parámetro de ruta (si existe)
   const routeUser = useMemo(() => {
      if (!routeUserParam) return null;
      try {
         return typeof routeUserParam === 'string' ? JSON.parse(routeUserParam) : routeUserParam;
      } catch {
         return null;
      }
   }, [routeUserParam]);

   // Prioridad: Perfil de BD > Parámetro de ruta > 'User'
   const displayName = friendProfile?.username || routeUser?.username || 'User';
   const avatarConfig = friendProfile?.avatar_config || routeUser?.avatar_config;
   const avatarUrl = friendProfile?.avatar_url || routeUser?.avatar_url;

   useEffect(() => {
      if (!friendProfile?.public_key && !routeUser?.public_key || messages.length === 0) return;
      const pubKey = friendProfile?.public_key || routeUser?.public_key;

      const mediaItems = messages
         .filter(m => m.type === 'image' && m.content && m.content !== 'OPENED_CAPSULE')
         .map(m => ({ filePath: m.content, friendPublicKey: pubKey }));

      if (mediaItems.length > 0) prefetchChatMedia(mediaItems);
   }, [messages, friendProfile?.public_key, routeUser?.public_key]);

   const lastReadMessageId = useMemo(() => {
      if (!currentUserId) return null;
      const lastRead = messages.find(m => m.sender_id === currentUserId && m.is_read === true);
      return lastRead ? lastRead.id : null;
   }, [messages, currentUserId]);

   const handleSendText = async () => {
      const cleanedMessage = cleanChatMessage(newMessage);
      const pubKey = friendProfile?.public_key || routeUser?.public_key;
      if (!cleanedMessage || !chatId || !currentUserId) return;

      if (!pubKey) {
         Alert.alert("Vault not ready", "Still establishing the secure channel with this contact. Try again in a moment.");
         return;
      }

      const replyToId = replyingTo?.id || null;
      // Optimistically clear the composer, but keep what we need to restore on failure.
      setNewMessage("");
      setReplyingTo(null);

      const restoreComposer = () => {
         setNewMessage(cleanedMessage);
         if (replyingTo) setReplyingTo(replyingTo);
      };

      try {
         const encryptedContent = await vaultCrypto.encryptMessage(cleanedMessage, pubKey);
         if (!encryptedContent) throw new Error("Encryption failed");

         vaultRAMCache[encryptedContent] = cleanedMessage;

         const { error } = await supabase.from('messages').insert({
            chat_id: chatId,
            sender_id: currentUserId,
            content: encryptedContent,
            type: 'text',
            is_read: false,
            reply_to_id: replyToId,
         });
         if (error) throw error;
      } catch (e) {
         console.error("❌ [SEND] Vault Send Error:", e);
         restoreComposer();
         Alert.alert("Message not sent", "Your message could not be secured and sent. It has been restored to the text box.");
      }
   };

   const renderItem = useCallback(({ item }: { item: any }) => {
      const mine = item.sender_id === currentUserId;
      const keyToUse = friendProfile?.public_key || routeUser?.public_key || "";
      const showReadReceipt = item.id === lastReadMessageId;

      // Cápsula view-once ya consumida: el emisor la marca content='OPENED_CAPSULE'
      const isOpenedCapsule = item.content === 'OPENED_CAPSULE';
      const isText = !isOpenedCapsule && (item.type === 'text' || !item.type);
      const isViewOnceSender = item.type === 'image-view-once' && mine;

      const replyData = Array.isArray(item.reply_to) ? item.reply_to[0] : item.reply_to;

      return (
         <View style={styles.rowContainer}>
            {item.reply_to_story && (
               <ReplyStory
                  content={item.reply_to_story}
                  isMyMessage={item.sender_id === currentUserId}
               />
            )}

            <TouchableOpacity
               activeOpacity={0.85}
               onPress={() => isText && setReplyingTo(item)}
               style={[
                  (isText || isViewOnceSender || isOpenedCapsule) ? styles.bubble : styles.bubbleImage,
                  mine ? styles.myBubble : styles.theirBubble
               ]}
            >
               {replyData && !isOpenedCapsule && (
                  <View style={{ marginBottom: 4 }}>
                     <Text style={{ color: '#aaa', fontSize: 11 }}>
                        Replying to {replyData.sender_id === currentUserId ? "yourself" : displayName}
                     </Text>
                  </View>
               )}

               {isOpenedCapsule ? (
                  <View style={styles.openedCapsule}>
                     <SymbolView name="eye.slash.fill" size={14} tintColor="#888" />
                     <Text style={styles.openedCapsuleText}>Opened</Text>
                  </View>
               ) : isText ? (
                  <MessageContent content={item.content} friendPublicKey={keyToUse} />
               ) : (
                  <MediaMessageBubble
                     filePath={item.content}
                     friendPublicKey={keyToUse}
                     isViewOnce={item.type === 'image-view-once'}
                     isMine={mine}
                  />
               )}
            </TouchableOpacity>

            {showReadReceipt && (
               <View style={styles.readReceiptContainer}>
                  <UserAvatar size={16} avatar_url={avatarUrl} avatar_config={avatarConfig} />
               </View>
            )}
         </View>
      );
   }, [currentUserId, friendProfile, routeUser, lastReadMessageId, displayName, avatarUrl, avatarConfig]);

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
                  } catch {
                     alert("Failed to burn history.");
                  }
               }
            }
         ]
      );
   };

   const handleProfile = useCallback(() => {
      router.push({
         pathname: "/(app)/chat-info",
         params: {
            chatId: chatId ?? "",
            friendId: targetFriendId,
         }
      });
   }, [chatId, targetFriendId])

   return (
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
                  <TouchableOpacity style={styles.headerBtn} onPress={handleProfile}>
                     <View style={styles.headerAvatar}>
                        <UserAvatar size={32} avatar_url={avatarUrl} avatar_config={avatarConfig} />
                     </View>
                     <View>
                        <Text style={styles.headerName}>@{displayName}</Text>
                        <Text style={styles.headerSub}>Chat & security info</Text>
                     </View>
                  </TouchableOpacity>
               ),
               headerRight: () => (
                  Platform.OS === 'ios' ? (
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
                  ) : (
                     <TouchableOpacity onPress={handleBurnHistory} style={{ padding: 8 }}>
                        <SymbolView name="trash" size={20} tintColor="#fff" />
                     </TouchableOpacity>
                  )
               )
            }}
         />

         {friendKeyChanged && (
            <TouchableOpacity style={styles.keyChangeBanner} onPress={handleProfile} activeOpacity={0.8}>
               <SymbolView name="exclamationmark.shield.fill" size={16} tintColor="#E6B800" />
               <Text style={styles.keyChangeText}>
                  @{displayName}&apos;s encryption keys changed. Messages from before then can&apos;t be read. Tap for details.
               </Text>
            </TouchableOpacity>
         )}

         {loading ? (
            <View style={styles.center}>
               <ActivityIndicator color={getThemeColor("tint")} size="large" />
            </View>
         ) : (
            <FlatList
               inverted
               data={messages}
               keyExtractor={(item) => item.id}
               renderItem={renderItem}
               onEndReached={() => {
                  if (hasMore && !loadingMore) {
                     loadMoreMessages();
                  }
               }}
               onEndReachedThreshold={0.2}
               contentContainerStyle={{ padding: 16 }}
               removeClippedSubviews={Platform.OS === 'android'}
               maxToRenderPerBatch={10}
               windowSize={5}
               ListFooterComponent={() => loadingMore ? <ActivityIndicator style={{ margin: 10 }} color={getThemeColor("tint")} /> : null}
            />
         )}

         {isUploading && (
            <View style={styles.uploadIndicator}>
               <ActivityIndicator size="small" color={getThemeColor("tint")} />
               <Text style={styles.uploadText}>Encrypting Vault...</Text>
            </View>
         )}

         {replyingTo && (
            <View style={styles.replyPreviewBar}>
               <View style={styles.replyPreviewContent}>
                  <Text style={styles.replyPreviewLabel}>
                     Replying to {replyingTo.sender_id === currentUserId ? "yourself" : displayName}
                  </Text>
                  <MessageContent content={replyingTo.content} friendPublicKey={friendProfile?.public_key || routeUser?.public_key} />
               </View>
               <TouchableOpacity onPress={() => setReplyingTo(null)}>
                  <SymbolView name="xmark.circle.fill" size={20} tintColor="#666" />
               </TouchableOpacity>
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
               disabled={!newMessage.trim() || loading}
            >
               <SymbolView
                  name="arrow.up.circle.fill"
                  size={48}
                  tintColor={newMessage.trim() ? getThemeColor("tint") : "#333"}
               />
            </TouchableOpacity>
         </View>

         <NymlyCamera
            visible={isCameraVisible}
            onClose={() => setCameraVisible(false)}
            onSend={(uri, type, option) => {
               const pubKey = friendProfile?.public_key || routeUser?.public_key;
               if (pubKey) {
                  const finalType = option || type;
                  sendCapturedImage(uri, finalType, pubKey);
               } else {
                  alert("Connecting Vault. Please wait a second.");
               }
            }}
         />
      </KeyboardAvoidingView>
   );
}