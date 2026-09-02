import UserAvatar from "@/components/UserAvatar";
import NymlySheet from '@/components/nymly-sheet';
import { AuthContext } from "@/context/AuthContext";
import { useBlockedUsers } from "@/context/BlockedUsersContext";
import { BottomSheetFlatList, BottomSheetModal } from '@gorhom/bottom-sheet';
import { useRouter } from "expo-router";
import { forwardRef, useCallback, useContext, useMemo } from 'react';
import { ActionSheetIOS, Alert, Platform, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { blocksApi } from "@/api/blocks";
import { reportsApi } from "@/api/reports";
import { promptReportReason } from "@/utils/moderation";
import { styles } from './CommentsSheet.styles';
import CommentInputFooter from './components/CommentInputFooter';
import { useComments } from './hooks';

interface Props {
    postId: string | null;
    postOwnerId: string;
}

const CommentsSheet = forwardRef<BottomSheetModal, Props>(({ postId }, ref) => {
    const router = useRouter()
    const insets = useSafeAreaInsets();
    const { comments, addComment } = useComments(postId);
    const { session } = useContext(AuthContext)
    const { isBlocked, blockedIds, blockLocally, unblockLocally } = useBlockedUsers();

    const visibleComments = useMemo(
        () => comments.filter((c) => !isBlocked(c.user?.id)),
        [comments, isBlocked, blockedIds],
    );

    const renderFooter = useCallback((props: any) => (
        <CommentInputFooter {...props} postId={postId} insets={insets} onCommentPosted={addComment} />
    ), [postId, insets, addComment]);

    const handleProfileUser = useCallback((item: any) => {
        if (session?.user.id === item.user?.id) return;
        if (ref && 'current' in ref && ref.current) ref.current.dismiss();
        router.push(`/(app)/user/${item.user?.id}`);
    }, [session?.user.id, ref, router]);

    const reportComment = useCallback(async (item: any) => {
        const reason = await promptReportReason("Report comment", "Why are you reporting this comment?");
        if (!reason) return;
        try {
            await reportsApi.submitReport({
                targetUserId: item.user?.id,
                reason,
                details: `Reported comment (${item.id}): "${item.content}"`,
            });
            Alert.alert("Report received", "Thanks. Our team reviews reports within 24 hours.");
        } catch (error: any) {
            if (error.message === "AlreadyReported") {
                Alert.alert("Note", "You have already reported this user.");
            } else {
                Alert.alert("Error", "The report could not be sent.");
            }
        }
    }, []);

    const blockCommenter = useCallback((item: any) => {
        const targetId = item.user?.id;
        if (!targetId) return;
        Alert.alert(
            "Block user",
            `@${item.user?.username || 'this user'} will no longer be able to contact you or see your content.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Block",
                    style: "destructive",
                    onPress: async () => {
                        const reason = await promptReportReason(
                            "Block user",
                            "Tell us what's wrong so we can review this account.",
                        );
                        blockLocally(targetId);
                        try {
                            await blocksApi.blockUser(targetId, reason ?? 'other');
                        } catch (e: any) {
                            if (e?.message !== "AlreadyBlocked") {
                                unblockLocally(targetId);
                                Alert.alert("Error", "Action could not be completed.");
                            }
                        }
                    },
                },
            ],
        );
    }, [blockLocally, unblockLocally]);

    const handleCommentLongPress = useCallback((item: any) => {
        if (!item.user?.id || session?.user.id === item.user?.id) return;
        const label = `@${item.user?.username || 'user'}`;
        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    options: ['Cancel', 'Report comment', `Block ${label}`],
                    destructiveButtonIndex: 2,
                    cancelButtonIndex: 0,
                    title: 'This comment',
                },
                (index) => {
                    if (index === 1) reportComment(item);
                    if (index === 2) blockCommenter(item);
                },
            );
        } else {
            Alert.alert('This comment', undefined, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Report comment', onPress: () => reportComment(item) },
                { text: `Block ${label}`, style: 'destructive', onPress: () => blockCommenter(item) },
            ]);
        }
    }, [session?.user.id, reportComment, blockCommenter]);

    const renderComment = useCallback(({ item }: { item: any }) => (
        <TouchableOpacity
            style={styles.commentRow}
            activeOpacity={0.7}
            onLongPress={() => handleCommentLongPress(item)}
            delayLongPress={280}
        >
            <View style={styles.avatarContainer}>
                <UserAvatar avatar_url={item.user?.avatar_url} avatar_config={item.user?.avatar_config} size={36} />
            </View>
            <View style={styles.commentContent}>
                <TouchableOpacity onPress={() => handleProfileUser(item)} disabled={session?.user.id === item.user?.id}>
                    <Text style={styles.username}>@{item.user?.username}</Text>
                </TouchableOpacity>
                <Text style={styles.commentText}>{item.content}</Text>
            </View>
        </TouchableOpacity>
    ), [session?.user.id, handleProfileUser, handleCommentLongPress]);

    return (
        <NymlySheet ref={ref} snapPoints={['65%', '100%']} footerComponent={renderFooter}>
            <View style={styles.sheetContainer}>
                <View style={styles.headerContainer}><Text style={styles.sheetTitle}>Comments</Text></View>
                <BottomSheetFlatList
                    data={visibleComments}
                    keyExtractor={(item) => item.id}
                    renderItem={renderComment}
                    contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
                />
            </View>
        </NymlySheet>
    );
});

export default CommentsSheet;
