import { SymbolView } from "expo-symbols";
import { memo } from "react";
import { Text, View } from "react-native";

import { getThemeColor } from "@/constants/theme";
import { useDecryptedMessage } from "../../hooks";
import { styles } from "./LastMessageContent.styles";

interface LastMessageContentProps {
    content: string;
    friendPublicKey: string;
    isMine: boolean;
    type?: string;
    /** The message is a reply to a story (messages.reply_to_story_id is set). */
    isStoryReply?: boolean;
    hasUnread: boolean;
}

/** A stored media message: type says so, or the content is a storage path. */
const isMediaMessage = (content: string, type?: string) => {
    const t = (type || "").toLowerCase().replace(/[_\s]/g, "-");
    if (t.includes("image") || t.includes("photo") || t.includes("video") || t.includes("once") || t.includes("capsule")) {
        return true;
    }
    if (!content || content.startsWith("v2:")) return false;
    // "<chatId>/<ts>.vault", signed URLs, legacy paths…
    return /\//.test(content) || /\.(vault|enc|jpe?g|png|webp|heic|mp4|mov)$/i.test(content);
};

const LastMessageContent = memo(({ content, friendPublicKey, isMine, type, isStoryReply, hasUnread }: LastMessageContentProps) => {
    const isOpenedCapsule = content === "OPENED_CAPSULE";
    const normType = (type || "").toLowerCase().replace(/[_\s]/g, "-");
    const isViewOnce = normType.includes("once");
    const isVideo = normType.includes("video") || /\.mp4/i.test(content || "");
    const media = !isStoryReply && !isOpenedCapsule && isMediaMessage(content, type);

    // Hook must run unconditionally; skip work when we already know it's media.
    const { text, status } = useDecryptedMessage(media || isOpenedCapsule || isStoryReply ? "" : content, friendPublicKey);

    const messageStyle = hasUnread ? styles.lastMessageUnread : isMine ? styles.lastMessageMine : styles.lastMessageRead;
    const prefix = isMine ? "You: " : "";

    if (isStoryReply) {
        const tint = hasUnread ? getThemeColor("text") : getThemeColor("textSecondary");
        return (
            <View style={styles.storyReplyRow}>
                <SymbolView name="arrowshape.turn.up.left.fill" size={12} tintColor={tint} />
                <Text style={[messageStyle, styles.storyReplyText]} numberOfLines={1}>
                    {isMine ? "Replied to their story" : "Replied to your story"}
                </Text>
            </View>
        );
    }

    let body: string;
    if (isOpenedCapsule) body = "👁 Opened";
    else if (media) body = isVideo ? "🎥 Video" : isViewOnce ? "📷 One-time photo" : "📷 Photo";
    else if (status === "pending") body = "…";
    else if (status === "failed") body = "🔒 Encrypted message";
    else body = text;

    return (
        <Text style={messageStyle} numberOfLines={1}>{prefix}{body}</Text>
    );
});

export default LastMessageContent;
