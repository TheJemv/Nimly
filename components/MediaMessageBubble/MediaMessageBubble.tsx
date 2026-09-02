import { getThemeColor } from '@/constants/theme';

import { supabase } from '@/lib/supabase';
import { vaultCrypto, vaultRAMCache } from '@/utils/crypto';
import { SymbolView } from 'expo-symbols';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Text, TouchableOpacity, View } from 'react-native';

import FullscreenImageViewer from './FullscreenImageViewer';
import { styles } from "./MediaMessageBubble.styles";

export default function MediaMessageBubble({ filePath, friendPublicKey, isViewOnce, isMine, onLocked }: { filePath: string, friendPublicKey: string, isViewOnce: boolean, isMine: boolean, onLocked?: () => void }) {
    const [imageUri, setImageUri] = useState<string | null>(vaultRAMCache[filePath] || null);
    const [isLoading, setIsLoading] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);

    const [isLocked, setIsLocked] = useState(vaultRAMCache[filePath] === 'LOCKED_CAPSULE');
    const [wasConsumed, setWasConsumed] = useState(false);

    // Let the chat screen hide media that can't be decrypted on this device
    // (e.g. sent before the contact's keys changed).
    useEffect(() => {
        if (isLocked) onLocked?.();
    }, [isLocked, onLocked]);

    // AUTO-DESCARGA SEGURA PARA FOTOS NORMALES
    useEffect(() => {
        let isMounted = true;

        const autoLoad = async () => {
            if (!isViewOnce && !imageUri && !isLocked && filePath && !isLoading) {
                await downloadAndDecrypt(false, isMounted, { silent: true });
            }
        };

        autoLoad();

        return () => {
            isMounted = false;
        };
    }, [filePath, isViewOnce]);

    const downloadAndDecrypt = async (
        triggerFullScreen = true,
        isMounted = true,
        { silent = false }: { silent?: boolean } = {}
    ) => {
        if (wasConsumed || isLocked || isLoading) return;

        // Verificar caché en RAM de nuevo
        if (vaultRAMCache[filePath] && vaultRAMCache[filePath] !== 'LOCKED_CAPSULE') {
            if (isMounted) {
                setImageUri(vaultRAMCache[filePath]);
                if (triggerFullScreen) setIsFullScreen(true);
            }
            return;
        }

        try {
            if (isMounted) setIsLoading(true);

            const { data: urlData, error: urlError } = await supabase.storage
                .from('chat-media')
                .createSignedUrl(filePath, 60);

            if (urlError || !urlData?.signedUrl) {
                throw new Error("No se pudo generar la URL firmada");
            }

            const response = await fetch(urlData.signedUrl);
            const encryptedText = await response.text();

            const base64Data = await vaultCrypto.decryptMessage(encryptedText.trim(), friendPublicKey);

            if (base64Data.startsWith("🔒")) {
                vaultRAMCache[filePath] = 'LOCKED_CAPSULE';
                if (isMounted) {
                    setIsLocked(true);
                    setIsLoading(false);
                }
                return;
            }

            const finalUri = `data:image/jpeg;base64,${base64Data}`;
            vaultRAMCache[filePath] = finalUri;

            if (isMounted) {
                setImageUri(finalUri);
                if (triggerFullScreen) {
                    setIsFullScreen(true);
                }
            }
        } catch (e) {
            console.error("Error descifrando multimedia:", e);
            if (isMounted && !silent) {
                Alert.alert(
                    "Photo unavailable",
                    "We couldn't load this photo. Check your connection and try again."
                );
            }
        } finally {
            if (isMounted) setIsLoading(false);
        }
    };

    const handleClose = async () => {
        setIsFullScreen(false);

        if (!(isViewOnce && !isMine)) return;

        try {
            // Se marca la cápsula como consumida ANTES de borrar el archivo. Si esta
            // actualización falla, el blob sigue disponible y el receptor puede
            // reintentar; nunca perdemos la foto por un corte de red.
            const { error: updErr } = await supabase.from('messages')
                .update({ content: 'OPENED_CAPSULE', type: 'text' })
                .eq('content', filePath);
            if (updErr) throw updErr;

            setWasConsumed(true);
            setImageUri(null);
            delete vaultRAMCache[filePath];

            // Borrado best-effort del blob cifrado (si falla, queda huérfano e ilegible).
            supabase.storage.from('chat-media').remove([filePath]).catch(() => { });
        } catch (e) {
            console.error("view-once consume failed:", e);
            Alert.alert(
                "Still available",
                "We couldn't mark this photo as opened. It will stay available until you open it again."
            );
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
                <Text style={styles.lockedText}>🔒 One-time photo</Text>
            </View>
        );
    }

    if (!isViewOnce) {
        return (
            <>
                <TouchableOpacity
                    onPress={() => {
                        if (imageUri) {
                            setIsFullScreen(true);
                        } else {
                            downloadAndDecrypt(true);
                        }
                    }}
                    style={styles.standardImageContainer}
                    disabled={isLoading}
                >
                    {imageUri ? (
                        <Image source={{ uri: imageUri }} style={styles.imageMini} resizeMode="cover" />
                    ) : (
                        <View style={styles.placeholder}>
                            {isLoading ? (
                                <>
                                    <ActivityIndicator color={getThemeColor('tint')} size="small" />
                                    <Text style={{ color: '#aaa', marginTop: 6, fontSize: 11, fontWeight: '500' }}>
                                        Unlocking...
                                    </Text>
                                </>
                            ) : (
                                <TouchableOpacity onPress={() => downloadAndDecrypt(false)} style={styles.retryTouch}>
                                    <SymbolView name="arrow.clockwise" size={24} tintColor="#aaa" />
                                    <Text style={{ color: '#aaa', marginTop: 4, fontSize: 10 }}>Tap to Load</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                </TouchableOpacity>

                <FullscreenImageViewer
                    visible={isFullScreen}
                    uri={imageUri}
                    onClose={() => setIsFullScreen(false)}
                />
            </>
        );
    }

    if (isMine) {
        return (
            <View style={styles.senderVO}>
                <SymbolView name="eye.fill" size={14} tintColor="#fff" />
                <Text style={styles.senderVOText}>One-time photo sent</Text>
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

            <FullscreenImageViewer
                visible={isFullScreen}
                uri={imageUri}
                onClose={handleClose}
            />
        </>
    );
}
