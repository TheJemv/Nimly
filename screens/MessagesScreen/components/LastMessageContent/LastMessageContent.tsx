import { memo } from "react";
import { Text } from "react-native";

import { useDecryptedMessage } from "../../hooks";
import { styles } from "./LastMessageContent.styles";

interface LastMessageContentProps {
    content: string;
    friendPublicKey: string;
    isMine: boolean;
    type?: string;
    hasUnread: boolean;
}

const LastMessageContent = memo(({ content, friendPublicKey, isMine, type, hasUnread }: LastMessageContentProps) => {
    const isOpenedCapsule = content === 'OPENED_CAPSULE';
    const decryptedText = useDecryptedMessage(isOpenedCapsule ? '' : content, friendPublicKey);
    const messageStyle = hasUnread ? styles.lastMessageUnread : isMine ? styles.lastMessageMine : styles.lastMessageRead;
    const normalizedType = type ? type.toLowerCase() : '';

    if (isOpenedCapsule) {
        return <Text style={messageStyle} numberOfLines={1}>{isMine ? 'You: ' : ''}👁 Opened</Text>;
    }
    const isMediaContent =
        normalizedType === 'image' ||
        normalizedType === 'image-view-once' ||
        normalizedType === 'video' ||
        content?.startsWith('http') ||
        content?.includes('storage') ||
        content?.includes('/');

    if (isMediaContent) {
        return <Text style={messageStyle} numberOfLines={1}>{isMine ? 'You: ' : ''}📷 Photo</Text>;
    }

    return <Text style={messageStyle} numberOfLines={1}>{isMine ? 'You: ' : ''}{decryptedText}</Text>;
});

export default LastMessageContent;