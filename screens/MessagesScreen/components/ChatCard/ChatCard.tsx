import { SymbolView } from 'expo-symbols';
import { Text, TouchableOpacity, View } from 'react-native';

import UserAvatar from "@/components/UserAvatar";
import { getThemeColor } from '@/constants/theme';

import { formatTime } from "../../utils";
import LastMessageContent from "../LastMessageContent";
import { styles } from "./ChatCard.styles";

interface ChatCardProps {
    item: any;
    myId: string | null;
    onPress: () => void;
}

export default function ChatCard({ item, myId, onPress }: ChatCardProps) {
    const messages = item.chats?.messages || [];
    const lastMsg = messages[messages.length - 1];
    const isMine = lastMsg?.sender_id === myId;
    const unreadCount = messages.filter((m: any) => m.sender_id !== myId && m.is_read === false).length;
    const hasUnread = unreadCount > 0;

    return (
        <TouchableOpacity style={styles.chatCard} onPress={onPress} activeOpacity={0.6}>
            <View style={styles.avatarWrapper}>
                <UserAvatar avatar_url={item.profiles?.avatar_url} avatar_config={item.profiles?.avatar_config} size={56} />
            </View>

            <View style={styles.chatInfo}>
                <View style={styles.chatHeader}>
                    <Text style={[styles.username, hasUnread ? styles.usernameUnread : styles.usernameRead]}>
                        @{item.profiles?.username}
                    </Text>
                    <View style={styles.timeWrapper}>
                        <Text style={[styles.timeText, hasUnread && { color: getThemeColor('text'), fontWeight: '500' }]}>
                            {lastMsg ? formatTime(lastMsg.created_at) : ''}
                        </Text>
                        <SymbolView name="chevron.right" size={10} tintColor={getThemeColor('icon')} />
                    </View>
                </View>

                <View style={styles.chatBodyRow}>
                    {lastMsg ? (
                        <LastMessageContent
                            content={lastMsg.content}
                            friendPublicKey={item.profiles?.public_key}
                            isMine={isMine}
                            type={lastMsg.type}
                            hasUnread={hasUnread}
                        />
                    ) : (
                        <Text style={styles.lastMessage}>No messages yet</Text>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );
}