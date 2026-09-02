import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
   FadeInDown,
   FadeInUp,
   FadeOutDown,
   useAnimatedStyle,
   useSharedValue,
   withSpring
} from "react-native-reanimated";

// Expo
import { Button, Host, Menu, Image as SwiftImage } from "@expo/ui/swift-ui";
import { GlassView } from "expo-glass-effect";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";

// Constants
import { getThemeColor } from "@/constants/theme";

// Components
import MediaMessageBubble from "@/components/MediaMessageBubble";
import { MessageContent } from "@/components/MessageContent";
import NymlyCamera from "@/components/NymlyCamera";
import { ReplyPreview } from "@/components/ReplyPreview";
import { ReplyStory } from "@/components/ReplyStory";
import UserAvatar from "@/components/UserAvatar";

// Utils
import { cleanChatMessage } from "@/utils/chatUtils";
import { vaultCrypto, vaultRAMCache } from "@/utils/crypto";
import { prefetchChatMedia } from "@/utils/mediaPrefetch";
import { ChatSystemNotice } from "./components/ChatSystemNotice";
import { DateSeparator } from "./components/DateSeparator";
import { cornerRadius, decorateMessages, formatBubbleTime, type DecoratedMessage } from "./utils/messageGrouping";

// More
import { chatApi } from "@/api/chat";
import { styles } from "./chat.styles";
import { useChatMedia, useChatSync } from "./hooks";

// Distancia máxima (px) que se desliza la burbuja al hacer swipe para ver la hora.
const MAX_REVEAL = 64;

export default function ChatScreen() {
   const { id: targetFriendId, user: routeUserParam } = useLocalSearchParams<{ id: string; user?: string }>();
   const router = useRouter();

   const [newMessage, setNewMessage] = useState("");
   const [isCameraVisible, setCameraVisible] = useState(false);
   const [replyingTo, setReplyingTo] = useState<any>(null);

   // Parsear el objeto user que viene por parámetro de ruta (si existe).
   const routeUser = useMemo(() => {
      if (!routeUserParam) return null;
      try {
         return typeof routeUserParam === 'string' ? JSON.parse(routeUserParam) : routeUserParam;
      } catch {
         return null;
      }
   }, [routeUserParam]);

   // Ids of messages that can't be decrypted on this device. They're removed
   // from the thread and replaced with a single in-chat notice.
   const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
   const probedRef = useRef<Set<string>>(new Set());

   const markLocked = useCallback((id: string) => {
      setHiddenIds(prev => {
         if (prev.has(id)) return prev;
         const next = new Set(prev);
         next.add(id);
         return next;
      });
   }, []);

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
      loadMoreMessages,
      sendText
   } = useChatSync(targetFriendId, routeUser?.public_key);

   const { sendCapturedImage, isUploading } = useChatMedia(chatId || '', currentUserId || '');

   const listRef = useRef<FlatList<any> | null>(null);

   // Swipe hacia la izquierda para revelar la hora de cada mensaje. Solo se
   // desplaza la burbuja propia (hacia el centro, nunca se recorta); en los
   // mensajes recibidos la hora simplemente aparece en el hueco de la derecha.
   const revealX = useSharedValue(0);
   const bubbleShiftStyle = useAnimatedStyle(() => ({ transform: [{ translateX: revealX.value }] }));
   const timeFadeStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, -revealX.value / MAX_REVEAL) }));
   const revealGesture = useMemo(
      () =>
         Gesture.Pan()
            .activeOffsetX([-15, 10000])
            .failOffsetY([-12, 12])
            .simultaneousWithExternalGesture(listRef as React.RefObject<any>)
            .onUpdate((e) => {
               revealX.value = Math.max(-MAX_REVEAL, Math.min(0, e.translationX));
            })
            .onEnd(() => {
               revealX.value = withSpring(0, { damping: 20, stiffness: 220, mass: 0.5 });
            }),
      [revealX]
   );

   // Mensajes con metadatos de agrupación y separadores de tiempo. Se reutiliza
   // la referencia previa de cada mensaje si su render no cambió, para que un
   // mensaje nuevo no fuerce el re-render de toda la lista visible.
   const decoratedCache = useRef<Map<string, DecoratedMessage>>(new Map());
   const decoratedMessages = useMemo(() => {
      const next = new Map<string, DecoratedMessage>();
      const source = hiddenIds.size > 0 ? messages.filter(m => !hiddenIds.has(m.id)) : messages;
      const result = decorateMessages(source, hasMore).map((d) => {
         const prev = decoratedCache.current.get(d.id);
         if (
            prev &&
            prev.__groupPosition === d.__groupPosition &&
            prev.__separatorLabel === d.__separatorLabel &&
            prev.__spacing === d.__spacing &&
            prev.content === d.content &&
            prev.is_read === d.is_read &&
            prev.type === d.type &&
            prev.__status === d.__status &&
            prev.reply_to === d.reply_to &&
            prev.reply_to_story === d.reply_to_story
         ) {
            next.set(d.id, prev);
            return prev;
         }
         next.set(d.id, d);
         return d;
      });
      decoratedCache.current = next;
      return result;
   }, [messages, hasMore, hiddenIds]);

   // Timestamp of the most recent hidden message — the in-chat key-change notice
   // is dropped in just before it.
   const newestHiddenAt = useMemo(() => {
      if (hiddenIds.size === 0) return null;
      let max = 0;
      for (const m of messages) {
         if (!hiddenIds.has(m.id)) continue;
         const t = new Date(m.created_at).getTime();
         if (t > max) max = t;
      }
      return max || null;
   }, [messages, hiddenIds]);

   // Prioridad: Perfil de BD > Parámetro de ruta > 'User'
   const displayName = friendProfile?.username || routeUser?.username || 'User';
   const avatarConfig = friendProfile?.avatar_config || routeUser?.avatar_config;
   const avatarUrl = friendProfile?.avatar_url || routeUser?.avatar_url;

   const keyChangeNotice = friendKeyChanged
      ? `@${displayName}'s encryption keys changed · earlier messages can't be opened`
      : `Some earlier messages can't be opened on this device`;

   // Final FlatList data: decorated (visible) messages with the key-change
   // notice spliced in at the boundary. List is inverted, so index 0 = newest.
   const listData = useMemo(() => {
      if (!newestHiddenAt) return decoratedMessages;
      const notice = { __system: true, id: 'sys-key-change', __label: keyChangeNotice } as any;
      const idx = decoratedMessages.findIndex(m => new Date(m.created_at).getTime() <= newestHiddenAt);
      if (idx === -1) return [...decoratedMessages, notice];
      return [...decoratedMessages.slice(0, idx), notice, ...decoratedMessages.slice(idx)];
   }, [decoratedMessages, newestHiddenAt, keyChangeNotice]);

   useEffect(() => {
      if (!friendProfile?.public_key && !routeUser?.public_key || messages.length === 0) return;
      const pubKey = friendProfile?.public_key || routeUser?.public_key;

      const mediaItems = messages
         .filter(m => m.type === 'image' && m.content && m.content !== 'OPENED_CAPSULE')
         .map(m => ({ filePath: m.content, friendPublicKey: pubKey }));

      if (mediaItems.length > 0) prefetchChatMedia(mediaItems);
   }, [messages, friendProfile?.public_key, routeUser?.public_key]);

   // Pre-decrypt text messages so undecryptable ones (e.g. from before the
   // contact rotated keys) are filtered out *before* they flash on screen. The
   // successful ones are warmed into the RAM cache so bubbles render instantly.
   useEffect(() => {
      const pubKey = friendProfile?.public_key || routeUser?.public_key;
      if (!pubKey || messages.length === 0) return;

      let cancelled = false;
      (async () => {
         const locked: string[] = [];
         for (const m of messages) {
            if (probedRef.current.has(m.id) || m.__status) continue; // skip optimistic bubbles
            const isTextMsg = (m.type === 'text' || !m.type) && m.content && m.content !== 'OPENED_CAPSULE';
            if (!isTextMsg) continue;

            const cached = vaultRAMCache[m.content];
            if (cached && !cached.startsWith('🔒')) { probedRef.current.add(m.id); continue; }

            try {
               const clear = await vaultCrypto.decryptMessage(m.content, pubKey);
               if (clear.startsWith('🔒')) locked.push(m.id);
               else vaultRAMCache[m.content] = clear;
            } catch {
               locked.push(m.id);
            }
            probedRef.current.add(m.id);
         }

         if (!cancelled && locked.length > 0) {
            setHiddenIds(prev => {
               const next = new Set(prev);
               locked.forEach(id => next.add(id));
               return next;
            });
         }
      })();

      return () => { cancelled = true; };
   }, [messages, friendProfile?.public_key, routeUser?.public_key]);

   const lastReadMessageId = useMemo(() => {
      if (!currentUserId) return null;
      const lastRead = messages.find(m => m.sender_id === currentUserId && m.is_read === true);
      return lastRead ? lastRead.id : null;
   }, [messages, currentUserId]);

   const scrollToBottom = useCallback((animated = true) => {
      // Inverted list: the newest message is at offset 0.
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated }));
   }, []);

   const handleSendText = async () => {
      const draft = newMessage;
      const pubKey = friendProfile?.public_key || routeUser?.public_key;
      if (!cleanChatMessage(draft) || !chatId || !currentUserId) return;

      if (!pubKey) {
         Alert.alert("Not ready yet", "Still setting up the secure connection with this contact. Try again in a moment.");
         return;
      }

      // Clear the composer right away; the message shows instantly as a pending
      // (grey) bubble and reconciles itself once the backend confirms it.
      const reply = replyingTo;
      setNewMessage("");
      setReplyingTo(null);

      // Jump to the newest message (inverted list -> offset 0), even if we were
      // scrolled up reading history.
      scrollToBottom();

      const res = await sendText(draft, pubKey, reply);

      // A pending bubble that fails stays in the thread as "Tap to retry", so we
      // only bounce the text back to the composer for pre-send problems.
      if (!res.ok && res.reason !== "send-failed") {
         setNewMessage(draft);
         if (reply) setReplyingTo(reply);
      }
   };

   const retrySend = useCallback((item: any) => {
      const pubKey = friendProfile?.public_key || routeUser?.public_key;
      if (!pubKey) return;
      // Reuse the same client_id so the unique index keeps the retry idempotent.
      sendText(item.__plain ?? "", pubKey, item.reply_to ?? null, item.id);
   }, [friendProfile, routeUser, sendText]);

   const renderItem = useCallback(({ item }: { item: any }) => {
      if (item.__system) {
         return <ChatSystemNotice text={item.__label} />;
      }

      const mine = item.sender_id === currentUserId;
      const keyToUse = friendProfile?.public_key || routeUser?.public_key || "";
      const showReadReceipt = item.id === lastReadMessageId;

      // Cápsula view-once ya consumida: el emisor la marca content='OPENED_CAPSULE'
      const isOpenedCapsule = item.content === 'OPENED_CAPSULE';
      const isText = !isOpenedCapsule && (item.type === 'text' || !item.type);
      const isViewOnceSender = item.type === 'image-view-once' && mine;

      const replyData = Array.isArray(item.reply_to) ? item.reply_to[0] : item.reply_to;

      const isMedia = !(isText || isViewOnceSender || isOpenedCapsule);
      const corners = cornerRadius(mine, item.__groupPosition);

      const pending = item.__status === 'sending';
      const failed = item.__status === 'failed';

      return (
         <View>
            {item.__separatorLabel ? <DateSeparator label={item.__separatorLabel} /> : null}

            <View style={[styles.rowContainer, { marginBottom: item.__spacing }]}>
               {item.reply_to_story && (
                  <ReplyStory
                     content={item.reply_to_story}
                     isMyMessage={item.sender_id === currentUserId}
                  />
               )}

               <View style={styles.revealRow}>
                  <Animated.View style={[
                     styles.bubbleColumn,
                     mine ? styles.bubbleColumnMine : styles.bubbleColumnTheirs,
                     mine ? bubbleShiftStyle : undefined,
                  ]}>
                     {replyData && !isOpenedCapsule && (
                        <ReplyPreview
                           reply={replyData}
                           isMine={mine}
                           friendName={displayName}
                           currentUserId={currentUserId}
                           friendPublicKey={keyToUse}
                        />
                     )}

                     <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                           if (failed) return retrySend(item);
                           if (pending) return;
                           if (isText) setReplyingTo(item);
                        }}
                        style={[
                           isMedia ? styles.bubbleImage : styles.bubble,
                           mine ? styles.myBubble : styles.theirBubble,
                           corners,
                           pending && styles.bubblePending,
                        ]}
                     >
                        {isOpenedCapsule ? (
                           <View style={styles.openedCapsule}>
                              <SymbolView name="eye.slash.fill" size={14} tintColor="#888" />
                              <Text style={styles.openedCapsuleText}>Opened</Text>
                           </View>
                        ) : isText ? (
                           item.__plain != null ? (
                              <Text style={styles.plainBubbleText}>{item.__plain}</Text>
                           ) : (
                              <MessageContent
                                 content={item.content}
                                 friendPublicKey={keyToUse}
                                 onLocked={() => markLocked(item.id)}
                              />
                           )
                        ) : (
                           <MediaMessageBubble
                              filePath={item.content}
                              friendPublicKey={keyToUse}
                              isViewOnce={item.type === 'image-view-once'}
                              isMine={mine}
                              onLocked={() => markLocked(item.id)}
                           />
                        )}
                     </TouchableOpacity>

                     {(pending || failed) && (
                        <Text style={[styles.sendStatusText, failed && styles.sendStatusFailed]}>
                           {failed ? 'Not sent · Tap to retry' : 'Sending…'}
                        </Text>
                     )}
                  </Animated.View>

                  <Animated.View style={[styles.timeReveal, timeFadeStyle]} pointerEvents="none">
                     <Text style={styles.timeRevealText} numberOfLines={1}>
                        {formatBubbleTime(item.created_at)}
                     </Text>
                  </Animated.View>

                  {showReadReceipt && (
                     <Animated.View
                        entering={FadeInUp.duration(260)}
                        exiting={FadeOutDown.duration(200)}
                        style={styles.readReceiptContainer}
                     >
                        <UserAvatar size={16} avatar_url={avatarUrl} avatar_config={avatarConfig} />
                     </Animated.View>
                  )}
               </View>
            </View>
         </View>
      );
   }, [currentUserId, friendProfile, routeUser, lastReadMessageId, displayName, avatarUrl, avatarConfig, bubbleShiftStyle, timeFadeStyle, markLocked, retrySend]);

   const handleBurnHistory = () => {
      if (!chatId) return;
      Alert.alert(
         "Clear Chat History",
         "Are you sure? This permanently deletes all messages and media for both of you.",
         [
            { text: "Cancel", style: "cancel" },
            {
               text: "Clear",
               style: "destructive",
               onPress: async () => {
                  try {
                     await chatApi.burnChatHistory(chatId);
                     setMessages([]);
                  } catch {
                     alert("Could not clear the chat history.");
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
                        {/* Menu opens on a single tap; ContextMenu needed a
                            long-press that often got stuck racing the list. */}
                        <Menu label={<SwiftImage systemName="ellipsis" />}>
                           <Button systemImage="bell.slash" label="Mute Notifications" onPress={() => { }} />
                           <Button systemImage="trash" label="Delete Chat" role="destructive" onPress={handleBurnHistory} />
                        </Menu>
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
            <GestureDetector gesture={revealGesture}>
               <FlatList
                  ref={listRef}
                  inverted
                  data={listData}
                  keyExtractor={(item) => item.id}
                  renderItem={renderItem}
                  onEndReached={() => {
                     if (hasMore && !loadingMore) {
                        loadMoreMessages();
                     }
                  }}
                  onEndReachedThreshold={0.4}
                  contentContainerStyle={{ padding: 16 }}
                  removeClippedSubviews={Platform.OS === 'android'}
                  initialNumToRender={15}
                  maxToRenderPerBatch={8}
                  updateCellsBatchingPeriod={40}
                  windowSize={7}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="interactive"
                  ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 10 }} color={getThemeColor("tint")} /> : null}
               />
            </GestureDetector>
         )}

         {isUploading && (
            <View style={styles.uploadIndicator}>
               <ActivityIndicator size="small" color={getThemeColor("tint")} />
               <Text style={styles.uploadText}>Encrypting…</Text>
            </View>
         )}

         {replyingTo && (
            <Animated.View
               entering={FadeInDown.duration(200)}
               exiting={FadeOutDown.duration(160)}
               style={styles.replyPreviewBar}
            >
               <View style={styles.replyAccent} />
               <View style={styles.replyPreviewContent}>
                  <Text style={styles.replyPreviewLabel} numberOfLines={1}>
                     Replying to {replyingTo.sender_id === currentUserId ? "yourself" : `@${displayName}`}
                  </Text>
                  {replyingTo.type === 'image' || replyingTo.type === 'image-view-once' || replyingTo.content === 'OPENED_CAPSULE' ? (
                     <View style={styles.replyPhotoRow}>
                        <SymbolView name="photo.fill" size={12} tintColor="#8E8E93" />
                        <Text style={styles.replyPreviewText}>Photo</Text>
                     </View>
                  ) : (
                     <MessageContent
                        content={replyingTo.content}
                        friendPublicKey={friendProfile?.public_key || routeUser?.public_key}
                        style={styles.replyPreviewText}
                        numberOfLines={1}
                     />
                  )}
               </View>
               <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={8}>
                  <SymbolView name="xmark.circle.fill" size={22} tintColor="#666" />
               </TouchableOpacity>
            </Animated.View>
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
                  scrollToBottom();
               } else {
                  alert("Connecting. Please wait a second.");
               }
            }}
         />
      </KeyboardAvoidingView>
   );
}