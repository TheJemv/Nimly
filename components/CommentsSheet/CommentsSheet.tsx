import UserAvatar from "@/components/UserAvatar";
import NymlySheet from '@/components/nymly-sheet';
import { BottomSheetFlatList, BottomSheetModal } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { styles } from './CommentsSheet.styles';
import CommentInputFooter from './components/CommentInputFooter';
import { useComments } from './hooks';

interface Props {
    postId: string | null;
    postOwnerId: string;
}

const CommentsSheet = forwardRef<BottomSheetModal, Props>(({ postId }, ref) => {
    const insets = useSafeAreaInsets();
    const { comments, addComment } = useComments(postId);

    const renderFooter = useCallback((props: any) => (
        <CommentInputFooter {...props} postId={postId} insets={insets} onCommentPosted={addComment} />
    ), [postId, insets, addComment]);

    const renderComment = useCallback(({ item }: { item: any }) => (
        <View style={styles.commentRow}>
            <View style={styles.avatarContainer}>
                <UserAvatar avatar_url={item.user?.avatar_url} avatar_config={item.user?.avatar_config} size={36} />
            </View>
            <View style={styles.commentContent}>
                <Text style={styles.username}>@{item.user?.username}</Text>
                <Text style={styles.commentText}>{item.content}</Text>
            </View>
        </View>
    ), []);

    return (
        <NymlySheet ref={ref} snapPoints={['65%', '100%']} footerComponent={renderFooter}>
            <View style={styles.sheetContainer}>
                <View style={styles.headerContainer}><Text style={styles.sheetTitle}>Comments</Text></View>
                <BottomSheetFlatList
                    data={comments}
                    keyExtractor={(item) => item.id}
                    renderItem={renderComment}
                    contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
                />
            </View>
        </NymlySheet>
    );
});

export default CommentsSheet;