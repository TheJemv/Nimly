import UserAvatar from '@/components/UserAvatar';
import { getThemeColor } from '@/constants/theme';
import { formatRelativeTime } from '@/utils/dateFormatter';
import { router } from 'expo-router';
import { SFSymbol, SymbolView } from 'expo-symbols';
import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

const BACKGROUND = getThemeColor('background');
const SURFACE = getThemeColor('surface');
const TEXT = getThemeColor('text');
const TEXT_SECONDARY = getThemeColor('textSecondary');
const TINT = getThemeColor('tint');
const BADGE = getThemeColor('badge');

/** What `acceptFriendship` (and the DB) write on a request once it's accepted. */
export const FRIEND_CONTENT = 'is now your friend.';

export interface NotificationRow {
    id: string;
    user_id: string;
    actor_id: string;
    type: string;
    content: string | null;
    post_id: string | null;
    request_id: string | null;
    is_read: boolean;
    created_at: string;
    actor?: { username: string; avatar_config: any } | null;
}

export type RequestAction = 'accept' | 'decline';

export const isFriendRequest = (n: NotificationRow) =>
    n.type?.toUpperCase() === 'FRIEND_REQUEST' && n.content !== FRIEND_CONTENT;

function typeBadge(n: NotificationRow): { icon: SFSymbol; color: string } {
    if (n.content === FRIEND_CONTENT) return { icon: 'person.2.fill', color: getThemeColor('success') };
    switch (n.type?.toUpperCase()) {
        case 'LIKE': return { icon: 'heart.fill', color: TINT };
        case 'COMMENT': return { icon: 'bubble.left.fill', color: '#3A3A3C' };
        case 'FRIEND_REQUEST': return { icon: 'person.badge.plus.fill', color: getThemeColor('warning') };
        default: return { icon: 'bell.fill', color: '#3A3A3C' };
    }
}

interface NotificationItemProps {
    notification: NotificationRow;
    /** Arrived unread: red dot + brighter text for as long as the screen is open. */
    isNew: boolean;
    /** Pending friend request addressed to me: inline Accept / Decline. */
    showRequestActions: boolean;
    busy?: RequestAction;
    onAccept: (n: NotificationRow) => void;
    onDecline: (n: NotificationRow) => void;
}

function NotificationItem({ notification: n, isNew, showRequestActions, busy, onAccept, onDecline }: NotificationItemProps) {
    const badge = typeBadge(n);

    return (
        <Pressable
            onPress={() => router.push(`/(app)/user/${n.actor_id}`)}
            style={({ pressed }) => [
                styles.row,
                showRequestActions && styles.rowTop,
                pressed && styles.rowPressed,
            ]}
        >
            <View style={styles.avatarWrap}>
                <UserAvatar avatar_config={n.actor?.avatar_config} size={48} />
                <View style={[styles.typeBadge, { backgroundColor: badge.color }]}>
                    <SymbolView name={badge.icon} size={10} tintColor="#FFF" />
                </View>
            </View>

            <View style={styles.body}>
                <Text style={[styles.text, isNew && styles.textNew]} numberOfLines={3}>
                    <Text style={styles.username}>@{n.actor?.username ?? 'someone'}</Text>
                    {n.content ? ` ${n.content}` : ''}
                    <Text style={styles.time}>{'  '}{formatRelativeTime(n.created_at)}</Text>
                </Text>

                {showRequestActions && (
                    <View style={styles.actions}>
                        <ActionButton
                            label="Accept"
                            primary
                            loading={busy === 'accept'}
                            disabled={!!busy}
                            onPress={() => onAccept(n)}
                        />
                        <ActionButton
                            label="Decline"
                            loading={busy === 'decline'}
                            disabled={!!busy}
                            onPress={() => onDecline(n)}
                        />
                    </View>
                )}
            </View>

            {isNew && <View style={[styles.unreadDot, showRequestActions && styles.unreadDotTop]} />}
        </Pressable>
    );
}

function ActionButton({ label, primary, loading, disabled, onPress }: {
    label: string;
    primary?: boolean;
    loading: boolean;
    disabled: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={({ pressed }) => [
                styles.button,
                primary ? styles.buttonPrimary : styles.buttonSecondary,
                (pressed || (disabled && !loading)) && styles.buttonDimmed,
            ]}
        >
            {loading
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={styles.buttonText}>{label}</Text>}
        </Pressable>
    );
}

export default memo(NotificationItem);

// Static and fading out on purpose, like the stories tray placeholder.
const SKELETON_OPACITY = [0.9, 0.7, 0.5, 0.35, 0.22, 0.12];

/** First-load placeholder: the shape of the list instead of a spinner. */
export function NotificationsSkeleton() {
    return (
        <View style={styles.skeleton}>
            {SKELETON_OPACITY.map((opacity, i) => (
                <View key={i} style={[styles.row, { opacity }]}>
                    <View style={styles.skeletonAvatar} />
                    <View style={styles.body}>
                        <View style={[styles.skeletonLine, { width: i % 2 ? '55%' : '75%' }]} />
                        <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
                    </View>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, gap: 12 },
    rowTop: { alignItems: 'flex-start' },
    rowPressed: { backgroundColor: 'rgba(255,255,255,0.04)' },

    avatarWrap: { width: 48, height: 48 },
    typeBadge: {
        position: 'absolute', right: -3, bottom: -3,
        width: 22, height: 22, borderRadius: 11,
        borderWidth: 2.5, borderColor: BACKGROUND,
        alignItems: 'center', justifyContent: 'center',
    },

    body: { flex: 1 },
    text: { color: TEXT, fontSize: 15, lineHeight: 20 },
    textNew: { color: '#FFF' },
    username: { color: '#FFF', fontWeight: '700' },
    time: { color: TEXT_SECONDARY, fontWeight: '400' },

    actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
    button: { flex: 1, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    buttonPrimary: { backgroundColor: TINT },
    buttonSecondary: { backgroundColor: '#262626' },
    buttonDimmed: { opacity: 0.6 },
    buttonText: { color: '#FFF', fontSize: 14, fontWeight: '600' },

    unreadDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: BADGE },
    unreadDotTop: { marginTop: 6 },

    skeleton: { paddingTop: 8 },
    skeletonAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: SURFACE },
    skeletonLine: { height: 12, borderRadius: 6, backgroundColor: SURFACE },
    skeletonLineShort: { width: '25%', marginTop: 8 },
});
