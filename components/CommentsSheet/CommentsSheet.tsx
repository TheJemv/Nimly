import UserAvatar from "@/components/UserAvatar";
import NymlySheet from '@/components/nymly-sheet';
import { AuthContext } from "@/context/AuthContext";
import { BottomSheetFlatList, BottomSheetModal } from '@gorhom/bottom-sheet';
import { useRouter } from "expo-router";
import { forwardRef, useCallback, useContext } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

    const renderFooter = useCallback((props: any) => (
        <CommentInputFooter {...props} postId={postId} insets={insets} onCommentPosted={addComment} />
    ), [postId, insets, addComment]);

    const handleProfileUser = useCallback((item: any) => {
        if (session?.user.id === item.user?.id) return;
        if (ref && 'current' in ref && ref.current) ref.current.dismiss();
        router.push(`/(app)/user/${item.user?.id}`);
    }, [session?.user.id, ref, router]);

    const renderComment = useCallback(({ item }: { item: any }) => (
        <View style={styles.commentRow}>
            <View style={styles.avatarContainer}>
                <UserAvatar avatar_url={item.user?.avatar_url} avatar_config={item.user?.avatar_config} size={36} />
            </View>
            <View style={styles.commentContent}>
                <TouchableOpacity onPress={() => handleProfileUser(item)} disabled={session?.user.id === item.user?.id}>
                    <Text style={styles.username}>@{item.user?.username}</Text>
                </TouchableOpacity>
                <Text style={styles.commentText}>{item.content}</Text>
            </View>
        </View>
    ), [session?.user.id, handleProfileUser]);

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