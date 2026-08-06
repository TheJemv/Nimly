import { getThemeColor } from '@/constants/theme';

import { supabase } from '@/lib/supabase';
import { vaultCrypto, vaultRAMCache } from '@/utils/crypto';
import { SymbolView } from 'expo-symbols';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Modal, PanResponder, Text, TouchableOpacity, View } from 'react-native';

import { styles } from "./MediaMessageBubble.styles";

export default function MediaMessageBubble({ filePath, friendPublicKey, isViewOnce, isMine }: { filePath: string, friendPublicKey: string, isViewOnce: boolean, isMine: boolean }) {
    const cachedValid = vaultRAMCache[filePath] && vaultRAMCache[filePath].startsWith('data:image');

    const [imageUri, setImageUri] = useState<string | null>(vaultRAMCache[filePath] || null);
    const [isLoading, setIsLoading] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);

    const [isLocked, setIsLocked] = useState(vaultRAMCache[filePath] === 'LOCKED_CAPSULE');
    const [wasConsumed, setWasConsumed] = useState(false);

    const panY = useRef(new Animated.Value(0)).current;
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderMove: Animated.event(
                [null, { dy: panY }],
                { useNativeDriver: false }
            ),
            onPanResponderRelease: (e, gestureState) => {
                if (gestureState.dy > 120) {
                    Animated.timing(panY, {
                        toValue: 1000,
                        duration: 150,
                        useNativeDriver: true,
                    }).start(() => {
                        // Solo cerramos el modal, NO reiniciamos la posición aquí
                        setIsFullScreen(false);
                    });
                } else {
                    Animated.spring(panY, {
                        toValue: 0,
                        useNativeDriver: true,
                    }).start();
                }
            },
        })
    ).current;

    // AUTO-DESCARGA SEGURA PARA FOTOS NORMALES
    useEffect(() => {
        let isMounted = true;

        const autoLoad = async () => {
            if (!isViewOnce && (!imageUri || cachedValid) && !isLocked && filePath && !isLoading) {
                await downloadAndDecrypt(false, isMounted);
            }
        };

        autoLoad();

        return () => {
            isMounted = false;
        };
    }, [filePath, isViewOnce]);

    const downloadAndDecrypt = async (triggerFullScreen = true, isMounted = true) => {
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
        } finally {
            if (isMounted) setIsLoading(false);
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

                {/* MODAL ACTUALIZADO */}
                <Modal visible={isFullScreen} transparent={true} animationType="fade">
                    <View style={styles.fullScreenContainer}>
                        {/* Contenedor Animado */}
                        <Animated.View
                            style={[
                                styles.animatedContainer, // Asegúrate de agregar este estilo (te lo pasé en el mensaje anterior)
                                { transform: [{ translateY: panY }] }
                            ]}
                            {...panResponder.panHandlers}
                        >
                            <TouchableOpacity style={styles.closeBtn} onPress={() => setIsFullScreen(false)}>
                                <SymbolView name="xmark.circle.fill" size={30} tintColor="#fff" />
                            </TouchableOpacity>

                            {imageUri && (
                                <Image
                                    source={{ uri: imageUri }}
                                    style={styles.fullScreenImage}
                                    resizeMode="contain"
                                />
                            )}
                        </Animated.View>
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

            {/* <Modal visible={isFullScreen} transparent={false} animationType="slide">
                <View style={styles.fullScreenContainer}>
                    <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
                        <SymbolView name="xmark.circle.fill" size={30} tintColor="#fff" />
                    </TouchableOpacity>
                    {imageUri && <Image source={{ uri: imageUri }} style={styles.fullScreenImage} resizeMode="contain" />}
                </View>
            </Modal> */}

            <Modal visible={isFullScreen} transparent={true} animationType="fade">
                <View style={styles.fullScreenContainer}>

                    {/* 3. Animated.View permite que el contenedor se mueva con el dedo */}
                    <Animated.View
                        style={[
                            styles.animatedContainer,
                            { transform: [{ translateY: panY }] } // Mueve el componente en el eje Y
                        ]}
                        {...panResponder.panHandlers} // Activa la detección del dedo aquí
                    >

                        <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
                            <SymbolView name="xmark.circle.fill" size={30} tintColor="#fff" />
                        </TouchableOpacity>

                        {imageUri && (
                            <Image
                                source={{ uri: imageUri }}
                                style={styles.fullScreenImage}
                                resizeMode="contain"
                            />
                        )}

                    </Animated.View>

                </View>
            </Modal>
        </>
    );
}