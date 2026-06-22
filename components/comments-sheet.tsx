import { createComment, getComments } from '@/api/comments';
import NymlySheet from '@/components/nymly-sheet'; // Tu wrapper personalizado
import { ESTILOS_DICEBEAR } from '@/constants/dicebear';
import { getThemeColor } from '@/constants/theme';
import { createAvatar } from '@dicebear/core';
import { BottomSheetFlatList, BottomSheetFooter, BottomSheetModal, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { SymbolView } from 'expo-symbols';
import React, { forwardRef, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

// Componente Footer estable (fuera del componente principal)
const CommentInputFooter = ({ postId, onCommentPosted, accentColor, insets, ...props }: any) => {
    const [text, setText] = useState("");
    const [isPosting, setIsPosting] = useState(false);

    const handleSend = async () => {
        if (!text.trim() || isPosting) return;
        setIsPosting(true);
        try {
            const comment = await createComment(postId, text.trim());
            onCommentPosted(comment);
            setText("");
        } catch (error) {
            Alert.alert("Error", "No se pudo publicar el comentario");
        } finally {
            setIsPosting(false);
        }
    };

    return (
        <BottomSheetFooter {...props} bottomInset={0}>
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
};

interface Props {
    postId: string | null;
    postOwnerId: string;
}

// AQUÍ LA CLAVE: forwardRef permite que el padre controle el modal
const CommentsSheet = forwardRef<BottomSheetModal, Props>(({ postId, postOwnerId }, ref) => {
    const [comments, setComments] = useState<any[]>([]);
    const accentColor = getThemeColor("tint");
    const insets = useSafeAreaInsets();

    const loadComments = useCallback(async (refresh = false) => {
        if (!postId) return;
        const data = await getComments(postId, 0);
        setComments(refresh ? data : data);
    }, [postId]);

    useEffect(() => {
        if (postId) loadComments(true);
    }, [postId, loadComments]);

    const renderFooter = useCallback((props: any) => (
        <CommentInputFooter {...props} postId={postId} insets={insets} accentColor={accentColor}
            onCommentPosted={(newComment: any) => setComments(prev => [newComment, ...prev])} />
    ), [postId, insets, accentColor]);

    const renderComment = useCallback(({ item }: { item: any }) => {
        const config = item.user?.avatar_config;
        const estilo = config ? ESTILOS_DICEBEAR.find(e => e.id === config.styleId) : ESTILOS_DICEBEAR[0];
        const avatarSvg = config ? createAvatar(estilo.collection, { ...config.options, radius: 50 }).toString() : null;

        return (
            <View style={styles.commentRow}>
                <View style={styles.avatarContainer}>
                    {avatarSvg ? <SvgXml xml={avatarSvg} width="100%" height="100%" /> : <View style={styles.avatarPlaceholder} />}
                </View>
                <View style={styles.commentContent}>
                    <Text style={styles.username}>@{item.user?.username}</Text>
                    <Text style={styles.commentText}>{item.content}</Text>
                </View>
            </View>
        );
    }, []);

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


const styles = StyleSheet.create({
    sheetContainer: { flex: 1, backgroundColor: '#050505' },
    headerContainer: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1C1C1E' },
    sheetTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', textAlign: 'center', paddingVertical: 14 },
    listContent: { paddingHorizontal: 16, paddingTop: 16 },
    commentRow: { flexDirection: 'row', marginBottom: 20 },
    avatarContainer: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1C1C1E', overflow: 'hidden', marginRight: 12 },
    avatarPlaceholder: { flex: 1, backgroundColor: '#2C2C2E' },
    commentContent: { flex: 1 },
    username: { color: '#FFF', fontSize: 14, fontWeight: '600', marginBottom: 2 },
    commentText: { color: '#EBEBF5', fontSize: 15, lineHeight: 20 },
    footerWrapper: { backgroundColor: '#050505', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#1C1C1E' },
    inputArea: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8
    },
    input: {
        flex: 1,
        backgroundColor: '#1C1C1E',
        borderRadius: 99,
        paddingHorizontal: 16,
        paddingVertical: 12,
        color: "#fff"
    },
    sendBtn: {
        height: 44,
        width: 44,
        justifyContent: 'center',
        alignItems: 'center',
    }
});

export default CommentsSheet;