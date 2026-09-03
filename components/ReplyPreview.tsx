import { SymbolView } from "expo-symbols";
import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { MessageContent } from "@/components/MessageContent";

interface ReplyTarget {
   id: string;
   content: string;
   sender_id: string;
   type?: string | null;
}

interface ReplyPreviewProps {
   /** The message being quoted (chat.messages -> reply_to relation). */
   reply: ReplyTarget;
   /** Whether the *reply* message (the one shown below) is mine. */
   isMine: boolean;
   /** Friend's display name (without the leading @). */
   friendName: string;
   currentUserId: string | null;
   friendPublicKey: string;
}

/** Devuelve icono + etiqueta si el mensaje citado es multimedia. */
export const replyMediaKind = (content?: string | null, type?: string | null): { icon: string; label: string } | null => {
   const t = (type || "").toLowerCase();
   if (content === "OPENED_CAPSULE") return { icon: "photo.fill", label: "Photo" };
   if (t.includes("video") || /\.mp4/i.test(content || "")) return { icon: "video.fill", label: "Video" };
   if (t.includes("once")) return { icon: "photo.fill", label: "One-time photo" };
   if (t.includes("image")) return { icon: "photo.fill", label: "Photo" };
   return null;
};

/**
 * Instagram-style quoted reply that sits just above a message bubble: a small
 * "X replied to Y" line and a tinted pill with a one-line peek of the original.
 */
export const ReplyPreview = memo(({ reply, isMine, friendName, currentUserId, friendPublicKey }: ReplyPreviewProps) => {
   const originalMine = reply.sender_id === currentUserId;

   let label: string;
   if (isMine && originalMine) label = "You replied to yourself";
   else if (isMine) label = `You replied to @${friendName}`;
   else if (originalMine) label = `@${friendName} replied to you`;
   else label = `@${friendName} replied to themselves`;

   const media = replyMediaKind(reply.content, reply.type);

   return (
      <View style={[styles.wrap, isMine ? styles.alignEnd : styles.alignStart]}>
         <View style={styles.labelRow}>
            <SymbolView name="arrowshape.turn.up.left.fill" size={10} tintColor="#8E8E93" />
            <Text style={styles.label} numberOfLines={1}>{label}</Text>
         </View>

         <View style={[styles.quote, isMine ? styles.quoteMine : styles.quoteTheirs]}>
            {media ? (
               <View style={styles.photoRow}>
                  <SymbolView name={media.icon as any} size={12} tintColor="#c7c7cc" />
                  <Text style={styles.quoteText}>{media.label}</Text>
               </View>
            ) : (
               <MessageContent
                  content={reply.content}
                  friendPublicKey={friendPublicKey}
                  style={styles.quoteText}
                  numberOfLines={1}
               />
            )}
         </View>
      </View>
   );
});

ReplyPreview.displayName = "ReplyPreview";

const styles = StyleSheet.create({
   wrap: { maxWidth: "82%", marginBottom: 3 },
   alignEnd: { alignItems: "flex-end" },
   alignStart: { alignItems: "flex-start" },
   labelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginBottom: 4,
      paddingHorizontal: 4,
   },
   label: { color: "#8E8E93", fontSize: 12, fontWeight: "500", flexShrink: 1 },
   quote: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
   },
   quoteMine: { backgroundColor: "rgba(255,255,255,0.14)", borderBottomRightRadius: 6 },
   quoteTheirs: { backgroundColor: "rgba(255,255,255,0.08)", borderBottomLeftRadius: 6 },
   photoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
   quoteText: { color: "#d1d1d6", fontSize: 13 },
});
