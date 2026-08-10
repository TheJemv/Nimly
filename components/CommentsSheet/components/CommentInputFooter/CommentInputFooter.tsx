import { createComment } from '@/api/comments';
import { getThemeColor } from '@/constants/theme';
import { BottomSheetFooter, BottomSheetFooterProps, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, TouchableOpacity, View } from 'react-native';
import { styles } from './CommentInputFooter.styles';

interface CommentInputFooterProps extends BottomSheetFooterProps {
    postId: string | null;
    onCommentPosted: (comment: any) => void;
    insets: { bottom: number };
}

export default function CommentInputFooter({
    postId,
    onCommentPosted,
    insets,
    ...footerProps
}: CommentInputFooterProps) {
    const [text, setText] = useState("");
    const [isPosting, setIsPosting] = useState(false);

    const handleSend = async () => {
        if (!text.trim() || isPosting || !postId) return;
        setIsPosting(true);
        try {
            const comment = await createComment(postId, text.trim());
            onCommentPosted(comment);
            setText("");
        } catch {
            Alert.alert("Error", "No se pudo publicar el comentario");
        } finally {
            setIsPosting(false);
        }
    };

    return (
        <BottomSheetFooter {...footerProps} bottomInset={0}>
            <View style={[styles.footerWrapper, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                <View style={styles.inputArea}>
                    <BottomSheetTextInput
                        style={styles.input}
                        placeholder="Escribe un comentario..."
                        placeholderTextColor="#636366"
                        value={text}
                        onChangeText={setText}
                        multiline
                    />
                    <TouchableOpacity style={[styles.sendBtn, !text.trim() && { opacity: 0.5 }]} onPress={handleSend} disabled={!text.trim() || isPosting}>
                        {isPosting ? <ActivityIndicator size="small" color="#FFF" /> :
                            <SymbolView name="arrow.up.circle.fill" size={48} tintColor={text.trim() ? getThemeColor("tint") : "#333"} />}
                    </TouchableOpacity>
                </View>
            </View>
        </BottomSheetFooter>
    );
}