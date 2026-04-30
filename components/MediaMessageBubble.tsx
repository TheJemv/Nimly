import { getThemeColor } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { vaultCrypto, vaultRAMCache } from '@/utils/crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { SymbolView } from 'expo-symbols';
import React, { useState } from 'react';
import { ActivityIndicator, Dimensions, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width, height } = Dimensions.get('window');

export default function MediaMessageBubble({ filePath, friendPublicKey, isViewOnce, isMine }: { filePath: string, friendPublicKey: string, isViewOnce: boolean, isMine: boolean }) {
    const [imageUri, setImageUri] = useState<string | null>(vaultRAMCache[filePath] || null);
    const [isLoading, setIsLoading] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [error, setError] = useState(false);

    // --- ESTADO DE BLOQUEO LOCAL INMEDIATO ---
    const [wasConsumed, setWasConsumed] = useState(false);

    // Rutina de descarga y desencriptación
    const downloadAndDecrypt = async () => {
        if (wasConsumed) return;
        if (imageUri) {
            setIsFullScreen(true);
            return;
        }

        try {
            setIsLoading(true);
            const { data: urlData, error: urlError } = await supabase.storage
                .from('chat-media')
                .createSignedUrl(filePath, 60);

            if (urlError || !urlData?.signedUrl) throw new Error("No URL");

            const tempFileUri = `${FileSystem.documentDirectory}temp_vault_${Date.now()}.txt`;
            await FileSystem.downloadAsync(urlData.signedUrl, tempFileUri);
            const encryptedText = await FileSystem.readAsStringAsync(tempFileUri, { encoding: 'utf8' });
            await FileSystem.deleteAsync(tempFileUri, { idempotent: true });

            const base64Data = await vaultCrypto.decryptMessage(encryptedText.trim(), friendPublicKey);
            if (base64Data.startsWith("🔒")) throw new Error("Math Failed");

            const finalUri = `data:image/jpeg;base64,${base64Data}`;
            setImageUri(finalUri);
            setIsLoading(false);
            setIsFullScreen(true);
        } catch (e) {
            console.error("Vault Error:", e);
            setError(true);
            setIsLoading(false);
        }
    };

    const handleClose = async () => {
        setIsFullScreen(false);

        if (isViewOnce && !isMine) {
            // 1. BLOQUEO INSTANTÁNEO: Ya no hay vuelta atrás
            setWasConsumed(true);
            setImageUri(null);

            try {
                // 2. Borrado físico y actualización en segundo plano
                await supabase.storage.from('chat-media').remove([filePath]);
                await supabase.from('messages')
                    .update({ content: 'OPENED_CAPSULE', type: 'text' })
                    .eq('content', filePath);

                delete vaultRAMCache[filePath];
            } catch (e) {
                console.error("Burn error:", e);
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

    // --- CASO 1: FOTO NORMAL (Cualquier usuario) ---
    if (!isViewOnce) {
        return (
            <>
                <TouchableOpacity onPress={downloadAndDecrypt} style={styles.standardImageContainer}>
                    {imageUri ? (
                        <Image source={{ uri: imageUri }} style={styles.imageMini} />
                    ) : (
                        <View style={styles.placeholder}>
                            <ActivityIndicator color="#666" />
                        </View>
                    )}
                </TouchableOpacity>

                <Modal visible={isFullScreen} transparent={false} animationType="fade">
                    <View style={styles.fullScreenContainer}>
                        <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
                            <SymbolView name="xmark.circle.fill" size={30} tintColor="#fff" />
                        </TouchableOpacity>
                        <Image source={{ uri: imageUri || '' }} style={styles.fullScreenImage} resizeMode="contain" />
                    </View>
                </Modal>
            </>
        );
    }

    // --- CASO 2: VIEW ONCE - REMITENTE (USUARIO A) ---
    if (isMine) {
        return (
            <View style={styles.senderVO}>
                <SymbolView name="eye.fill" size={14} tintColor="#fff" />
                <Text style={styles.senderVOText}>View-once Capsule sent</Text>
            </View>
        );
    }

    // --- CASO 3: VIEW ONCE - RECEPTOR (USUARIO B) ---
    return (
        <>
            <TouchableOpacity
                style={styles.receiverVO}
                onPress={downloadAndDecrypt}
                disabled={isLoading}
            >
                {isLoading ? (
                    <ActivityIndicator color={getThemeColor('tint')} size="small" />
                ) : (
                    <>
                        <SymbolView name="play.fill" size={12} tintColor={getThemeColor('tint')} />
                        <Text style={styles.receiverVOText}>View Photo</Text>
                    </>
                )}
            </TouchableOpacity>

            <Modal visible={isFullScreen} transparent={false} animationType="slide">
                <View style={styles.fullScreenContainer}>
                    <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
                        <SymbolView name="xmark.circle.fill" size={30} tintColor="#fff" />
                    </TouchableOpacity>
                    {imageUri && <Image source={{ uri: imageUri }} style={styles.fullScreenImage} resizeMode="cover" />}
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    standardImageContainer: { width: 200, height: 250, borderRadius: 15, overflow: 'hidden', backgroundColor: '#1c1c1e' },
    imageMini: { width: '100%', height: '100%' },
    placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    // Diseño Usuario A (Minimalista)
    senderVO: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    senderVOText: { color: '#fff', fontSize: 14, opacity: 0.8 },
    // Diseño Usuario B (Botón tipo mensaje)
    receiverVO: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
    receiverVOText: { color: getThemeColor('tint'), fontSize: 16, fontWeight: '600' },
    // Pantalla Completa
    fullScreenContainer: { flex: 1, backgroundColor: '#000' },
    fullScreenImage: { width: width, height: height },
    closeBtn: { position: 'absolute', top: 60, right: 25, zIndex: 99, shadowColor: '#000', shadowRadius: 10, shadowOpacity: 0.5 }
});