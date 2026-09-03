import { getThemeColor } from '@/constants/theme';

import { supabase } from '@/lib/supabase';
import { vaultCrypto, vaultRAMCache } from '@/utils/crypto';
import * as Sentry from '@sentry/react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { SymbolView } from 'expo-symbols';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Text, TouchableOpacity, View } from 'react-native';

import FullscreenImageViewer from './FullscreenImageViewer';
import FullscreenVideoViewer from './FullscreenVideoViewer';
import { styles } from "./MediaMessageBubble.styles";

interface Props {
    filePath: string;
    friendPublicKey: string;
    isViewOnce: boolean;
    isMine: boolean;
    onLocked?: () => void;
    /** Long-press en la burbuja → responder a este mensaje. */
    onRequestReply?: () => void;
}

/** El sufijo antes de `.vault` (ver useChatMedia) indica el tipo. */
const isVideoPath = (p: string) => /\.mp4(\.vault)?$/i.test(p);

export default function MediaMessageBubble({ filePath, friendPublicKey, isViewOnce, isMine, onLocked, onRequestReply }: Props) {
    const isVideo = isVideoPath(filePath);

    const [mediaUri, setMediaUri] = useState<string | null>(vaultRAMCache[filePath] || null);
    const [isLoading, setIsLoading] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);

    const [isLocked, setIsLocked] = useState(vaultRAMCache[filePath] === 'LOCKED_CAPSULE');
    const [wasConsumed, setWasConsumed] = useState(false);

    // Preview en línea del video (primer frame, sin sonido, en pausa).
    const previewPlayer = useVideoPlayer(isVideo && mediaUri ? mediaUri : null, (p) => {
        p.muted = true;
        p.loop = false;
    });

    useEffect(() => {
        if (isLocked) onLocked?.();
    }, [isLocked, onLocked]);

    useEffect(() => {
        let isMounted = true;
        const autoLoad = async () => {
            if (!isViewOnce && !mediaUri && !isLocked && filePath && !isLoading) {
                await downloadAndDecrypt(false, isMounted, { silent: true });
            }
        };
        autoLoad();
        return () => { isMounted = false; };
    }, [filePath, isViewOnce]);

    const decryptToLocalFile = async (base64Data: string): Promise<string> => {
        const safe = filePath.replace(/[^a-z0-9]/gi, '_');
        const target = `${FileSystem.cacheDirectory}nimly_${safe}.mp4`;
        await FileSystem.writeAsStringAsync(target, base64Data, { encoding: 'base64' });
        return target;
    };

    const downloadAndDecrypt = async (
        triggerFullScreen = true,
        isMounted = true,
        { silent = false }: { silent?: boolean } = {}
    ) => {
        if (wasConsumed || isLocked || isLoading) return;

        const cached = vaultRAMCache[filePath];
        if (cached && cached !== 'LOCKED_CAPSULE') {
            if (isMounted) {
                setMediaUri(cached);
                if (triggerFullScreen) setIsFullScreen(true);
            }
            return;
        }

        try {
            if (isMounted) setIsLoading(true);

            const { data: urlData, error: urlError } = await supabase.storage
                .from('chat-media')
                .createSignedUrl(filePath, 60);
            if (urlError || !urlData?.signedUrl) throw new Error("Signed URL failed");

            const response = await fetch(urlData.signedUrl);
            const encryptedText = await response.text();
            const base64Data = await vaultCrypto.decryptMessage(encryptedText.trim(), friendPublicKey);

            if (base64Data.startsWith("🔒")) {
                vaultRAMCache[filePath] = 'LOCKED_CAPSULE';
                if (isMounted) { setIsLocked(true); setIsLoading(false); }
                return;
            }

            const finalUri = isVideo
                ? await decryptToLocalFile(base64Data)
                : `data:image/jpeg;base64,${base64Data}`;
            vaultRAMCache[filePath] = finalUri;

            if (isMounted) {
                setMediaUri(finalUri);
                if (triggerFullScreen) setIsFullScreen(true);
            }
        } catch (e) {
            console.error("Media decrypt error:", e);
            Sentry.captureException(e, { tags: { area: 'chat-media-decrypt' } });
            if (isMounted && !silent) {
                Alert.alert("Media unavailable", "We couldn't load this. Check your connection and try again.");
            }
        } finally {
            if (isMounted) setIsLoading(false);
        }
    };

    const handleClose = async () => {
        setIsFullScreen(false);
        if (!(isViewOnce && !isMine)) return;

        try {
            const { error: updErr } = await supabase.from('messages')
                .update({ content: 'OPENED_CAPSULE', type: 'text' })
                .eq('content', filePath);
            if (updErr) throw updErr;

            setWasConsumed(true);
            setMediaUri(null);
            delete vaultRAMCache[filePath];
            supabase.storage.from('chat-media').remove([filePath]).catch(() => { });
        } catch (e) {
            console.error("view-once consume failed:", e);
            Alert.alert("Still available", "We couldn't mark this as opened. It stays available until you open it again.");
        }
    };

    const mediaLabel = isVideo ? 'video' : 'photo';

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
                <Text style={styles.lockedText}>🔒 One-time {mediaLabel}</Text>
            </View>
        );
    }

    if (!isViewOnce) {
        return (
            <>
                <TouchableOpacity
                    onPress={() => (mediaUri ? setIsFullScreen(true) : downloadAndDecrypt(true))}
                    onLongPress={onRequestReply}
                    delayLongPress={250}
                    style={styles.standardImageContainer}
                    disabled={isLoading}
                    activeOpacity={0.9}
                >
                    {mediaUri ? (
                        isVideo ? (
                            <View style={styles.imageMini}>
                                <VideoView
                                    player={previewPlayer}
                                    style={styles.imageMini}
                                    contentFit="cover"
                                    nativeControls={false}
                                />
                                <View style={styles.playOverlay}>
                                    <SymbolView name="play.circle.fill" size={44} tintColor="rgba(255,255,255,0.95)" />
                                </View>
                            </View>
                        ) : (
                            <Image source={{ uri: mediaUri }} style={styles.imageMini} resizeMode="cover" />
                        )
                    ) : (
                        <View style={styles.placeholder}>
                            {isLoading ? (
                                <>
                                    <ActivityIndicator color={getThemeColor('tint')} size="small" />
                                    <Text style={{ color: '#aaa', marginTop: 6, fontSize: 11, fontWeight: '500' }}>Unlocking…</Text>
                                </>
                            ) : (
                                <TouchableOpacity onPress={() => downloadAndDecrypt(false)} style={styles.retryTouch}>
                                    <SymbolView name="arrow.clockwise" size={24} tintColor="#aaa" />
                                    <Text style={{ color: '#aaa', marginTop: 4, fontSize: 10 }}>Tap to load</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                </TouchableOpacity>

                {isVideo ? (
                    <FullscreenVideoViewer visible={isFullScreen} uri={mediaUri} onClose={() => setIsFullScreen(false)} />
                ) : (
                    <FullscreenImageViewer visible={isFullScreen} uri={mediaUri} onClose={() => setIsFullScreen(false)} />
                )}
            </>
        );
    }

    if (isMine) {
        return (
            <View style={styles.senderVO}>
                <SymbolView name="eye.fill" size={14} tintColor="#fff" />
                <Text style={styles.senderVOText}>One-time {mediaLabel} sent</Text>
            </View>
        );
    }

    return (
        <>
            <TouchableOpacity
                style={styles.receiverVOContainer}
                onPress={() => downloadAndDecrypt(true)}
                onLongPress={onRequestReply}
                delayLongPress={250}
                disabled={isLoading}
            >
                {isLoading ? (
                    <ActivityIndicator color={getThemeColor('tint')} size="small" />
                ) : (
                    <>
                        <View style={styles.iconCircle}>
                            <SymbolView name="play.fill" size={10} tintColor="#fff" />
                        </View>
                        <Text style={styles.receiverVOText}>View {mediaLabel}</Text>
                    </>
                )}
            </TouchableOpacity>

            {isVideo ? (
                <FullscreenVideoViewer visible={isFullScreen} uri={mediaUri} onClose={handleClose} />
            ) : (
                <FullscreenImageViewer visible={isFullScreen} uri={mediaUri} onClose={handleClose} />
            )}
        </>
    );
}
