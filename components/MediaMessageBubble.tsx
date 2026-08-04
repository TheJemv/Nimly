import { getThemeColor } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { vaultCrypto, vaultRAMCache } from '@/utils/crypto';
import { SymbolView } from 'expo-symbols';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width, height } = Dimensions.get('window');

export default function MediaMessageBubble({ filePath, friendPublicKey, isViewOnce, isMine }: { filePath: string, friendPublicKey: string, isViewOnce: boolean, isMine: boolean }) {
    const [imageUri, setImageUri] = useState<string | null>(vaultRAMCache[filePath] || null);
    const [isLoading, setIsLoading] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);

    const [isLocked, setIsLocked] = useState(vaultRAMCache[filePath] === 'LOCKED_CAPSULE');
    const [wasConsumed, setWasConsumed] = useState(false);

    // AUTO-DESCARGA PARA FOTOS NORMALES (solo si no vino ya del prefetch)
    useEffect(() => {
        if (!isViewOnce && !imageUri && !isLocked && filePath) {
            downloadAndDecrypt(false);
        }
    }, [filePath, isViewOnce]);

    const downloadAndDecrypt = async (triggerFullScreen = true) => {
        if (wasConsumed || isLocked || isLoading) return;
        if (vaultRAMCache[filePath] && vaultRAMCache[filePath] !== 'LOCKED_CAPSULE') {
            setImageUri(vaultRAMCache[filePath]);
            if (triggerFullScreen) setIsFullScreen(true);
            return;
        }

        if (imageUri && imageUri !== 'LOCKED_CAPSULE') {
            if (triggerFullScreen) setIsFullScreen(true);
            return;
        }

        try {
            setIsLoading(true);
            await new Promise(resolve => setTimeout(resolve, 80));
            const { data: urlData, error: urlError } = await supabase.storage
                .from('chat-media')
                .createSignedUrl(filePath, 60);

            if (urlError || !urlData?.signedUrl) {
                setIsLoading(false);
                return;
            }

            const response = await fetch(urlData.signedUrl);
            const encryptedText = await response.text();
            await new Promise(resolve => setTimeout(resolve, 50));
            const base64Data = await vaultCrypto.decryptMessage(encryptedText.trim(), friendPublicKey);

            if (base64Data.startsWith("🔒")) {
                vaultRAMCache[filePath] = 'LOCKED_CAPSULE';
                setIsLocked(true);
                setIsLoading(false);
                return;
            }

            const finalUri = `data:image/jpeg;base64,${base64Data}`;
            vaultRAMCache[filePath] = finalUri;
            setImageUri(finalUri);

            if (triggerFullScreen) {
                setIsFullScreen(true);
            }
        } catch (e) {
            console.error("Error descifrando multimedia:", e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleClose = async () => {
        setIsFullScreen(false);

        if (isViewOnce && !isMine) {
            setWasConsumed(true);
            setImageUri(null);

            try {
                await supabase.storage.from('chat-media').remove([filePath]);
                await supabase.from('messages')
                    .update({ content: 'OPENED_CAPSULE', type: 'text' })
                    .eq('content', filePath);

                delete vaultRAMCache[filePath];
            } catch (e) {
                // Silencioso
            }
        }
    };

    if (wasConsumed) {
        return (
            <View style={styles.receiverVO}>
                <SymbolView name="eye.slash.fill" size={14} tintColor="#888" />
                <Text style={{ color: '#888', fontStyle: 'italic', marginLeft: 8 }}>Opened</Text>
            </View>
        );
    }

    if (isLocked) {
        return (
            <View style={styles.lockedContainer}>
                <Text style={styles.lockedText}>🔒 Locked Capsule</Text>
            </View>
        );
    }

    if (!isViewOnce) {
        return (
            <>
                <TouchableOpacity
                    onPress={() => downloadAndDecrypt(true)}
                    style={styles.standardImageContainer}
                    disabled={isLoading}
                >
                    {imageUri ? (
                        <Image source={{ uri: imageUri }} style={styles.imageMini} />
                    ) : (
                        <View style={styles.placeholder}>
                            {isLoading ? (
                                <>
                                    <ActivityIndicator color={getThemeColor('tint')} size="large" />
                                    <Text style={{ color: '#aaa', marginTop: 10, fontSize: 12, fontWeight: '500' }}>
                                        Decrypting secure image...
                                    </Text>
                                </>
                            ) : (
                                <SymbolView name="photo.fill" size={30} tintColor="#666" />
                            )}
                        </View>
                    )}
                </TouchableOpacity>

                {/* 👇 MODAL AGREGADO PARA QUE LA IMAGEN NORMAL SÍ SE VEA EN PANTALLA COMPLETA */}
                <Modal visible={isFullScreen} transparent={false} animationType="fade">
                    <View style={styles.fullScreenContainer}>
                        <TouchableOpacity style={styles.closeBtn} onPress={() => setIsFullScreen(false)}>
                            <SymbolView name="xmark.circle.fill" size={30} tintColor="#fff" />
                        </TouchableOpacity>
                        {imageUri && <Image source={{ uri: imageUri }} style={styles.fullScreenImage} resizeMode="contain" />}
                    </View>
                </Modal>
            </>
        );
    }

    if (isMine) {
        return (
            <View style={styles.senderVO}>
                <SymbolView name="eye.fill" size={14} tintColor="#fff" />
                <Text style={styles.senderVOText}>View-once Capsule sent</Text>
            </View>
        );
    }

    return (
        <>
            <TouchableOpacity
                style={styles.receiverVOContainer}
                onPress={() => downloadAndDecrypt(true)}
                disabled={isLoading}
            >
                {isLoading ? (
                    <ActivityIndicator color={getThemeColor('tint')} size="small" />
                ) : (
                    <>
                        <View style={styles.iconCircle}>
                            <SymbolView name="play.fill" size={10} tintColor="#fff" />
                        </View>
                        <Text style={styles.receiverVOText}>View Photo</Text>
                    </>
                )}
            </TouchableOpacity>

            <Modal visible={isFullScreen} transparent={false} animationType="slide">
                <View style={styles.fullScreenContainer}>
                    <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
                        <SymbolView name="xmark.circle.fill" size={30} tintColor="#fff" />
                    </TouchableOpacity>
                    {imageUri && <Image source={{ uri: imageUri }} style={styles.fullScreenImage} resizeMode="contain" />}
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    standardImageContainer: { width: 200, height: 250, borderRadius: 15, overflow: 'hidden', backgroundColor: '#1c1c1e' },
    imageMini: { width: '100%', height: '100%' },
    placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    senderVO: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    senderVOText: { color: '#fff', fontSize: 14, opacity: 0.8 },
    receiverVOContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: '#1C1C1E',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#1C1C1E',
    },
    iconCircle: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: 'rgba(255,255,255,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    receiverVOText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500'
    },
    receiverVO: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
    fullScreenContainer: { flex: 1, backgroundColor: '#000' },
    fullScreenImage: { width: width, height: height },
    closeBtn: { position: 'absolute', top: 60, right: 25, zIndex: 99, shadowColor: '#000', shadowRadius: 10, shadowOpacity: 0.5 },
    lockedContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12, minWidth: 150 },
    lockedText: { color: '#fff', fontSize: 16 }
});