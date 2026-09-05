import { createComment } from '@/api/comments';
import { getThemeColor } from '@/constants/theme';
import { BottomSheetFooter, BottomSheetFooterProps, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, TouchableOpacity, View } from 'react-native';
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

    // El inset del safe-area de abajo (home indicator) solo hace falta cuando
    // el teclado está cerrado -- con el teclado abierto ya cubre esa zona, y
    // sumarlo igual dejaba un hueco negro entre el input y el teclado.
    const [keyboardVisible, setKeyboardVisible] = useState(false);
    useEffect(() => {
        const showSub = Keyboard.addListener('keyboardWillShow', () => setKeyboardVisible(true));
        const hideSub = Keyboard.addListener('keyboardWillHide', () => setKeyboardVisible(false));
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    const handleSend = async () => {
        if (!text.trim() || isPosting || !postId) return;
        setIsPosting(true);
        try {
            const comment = await createComment(postId, text.trim());
            onCommentPosted(comment);
            setText("");
        } catch {
            Alert.alert("Error", "Could not post the comment");
        } finally {
            setIsPosting(false);
        }
    };

    return (
        <BottomSheetFooter {...footerProps} bottomInset={0}>
            <View style={[styles.footerWrapper, { paddingBottom: keyboardVisible ? 12 : Math.max(insets.bottom, 12) }]}>
                <View style={styles.inputArea}>
                    <BottomSheetTextInput
                        style={styles.input}
                        placeholder="Write a comment..."
                        placeholderTextColor={getThemeColor("textSecondary")}
                        value={text}
                        onChangeText={setText}
                        multiline
                    />
                    <TouchableOpacity style={[styles.sendBtn, !text.trim() && { opacity: 0.5 }]} onPress={handleSend} disabled={!text.trim() || isPosting}>
                        {isPosting ? <ActivityIndicator size="small" color="#FFF" /> :
                            <SymbolView name="arrow.up.circle.fill" size={32} tintColor={text.trim() ? getThemeColor("tint") : getThemeColor("icon")} />}
                    </TouchableOpacity>
                </View>
            </View>
        </BottomSheetFooter>
    );
}