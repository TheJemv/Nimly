// components/NymlyCamera.tsx
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { GlassView } from 'expo-glass-effect';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { SymbolView } from 'expo-symbols';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PermissionRequest from '@/components/PermissionRequest';
import { getThemeColor } from '@/constants/theme';
import CameraModeSelector, { CameraCaptureMode } from '../CameraModeSelector/CameraModeSelector';
import { styles } from './NimlyCamera.styles';

// Los videos se cifran E2EE (base64 en memoria), así que se limitan en
// duración y resolución para que el blob sea manejable.
const MAX_VIDEO_SECONDS = 12;

interface CapturedMedia {
    uri: string;
    type: 'image' | 'video';
}

interface NymlyCameraProps {
    visible: boolean;
    onClose: () => void;
    onSend: (uri: string, mediaType: 'image' | 'video', option?: 'image-view-once') => void;
    mode?: 'chat' | 'simple' | 'story';
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function NymlyCamera({ visible, onClose, onSend, mode = 'chat' }: NymlyCameraProps) {
    const insets = useSafeAreaInsets();
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();
    const [micPermission, requestMicPermission] = useMicrophonePermissions();

    const [captureMode, setCaptureMode] = useState<CameraCaptureMode>('photo');
    const [facing, setFacing] = useState<'back' | 'front'>('back');
    const [flash, setFlash] = useState<'off' | 'on'>('off');
    const [capturedMedia, setCapturedMedia] = useState<CapturedMedia | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    const [elapsed, setElapsed] = useState(0);

    const [zoom, setZoom] = useState(0);
    const baseZoomRef = useRef(0);
    const cameraRef = useRef<CameraView>(null);

    const videoPlayer = useVideoPlayer(
        capturedMedia?.type === 'video' ? capturedMedia.uri : null,
        (player) => {
            player.loop = true;
            player.muted = false;
            player.play();
        }
    );

    // Cronómetro de grabación.
    useEffect(() => {
        if (!isRecording) {
            setElapsed(0);
            return;
        }
        const id = setInterval(() => setElapsed((e) => e + 1), 1000);
        return () => clearInterval(id);
    }, [isRecording]);

    // Autoplay de la vista previa de video (el callback de useVideoPlayer solo
    // corre al montar, no cuando cambia la fuente).
    useEffect(() => {
        if (capturedMedia?.type === 'video' && videoPlayer) {
            try {
                videoPlayer.loop = true;
                videoPlayer.play();
            } catch { /* preview no crítica */ }
        }
    }, [capturedMedia, videoPlayer]);

    // Al cerrar / reabrir, volvemos a la cámara limpia.
    useEffect(() => {
        if (!visible) {
            setCapturedMedia(null);
            setIsRecording(false);
            setZoom(0);
        }
    }, [visible]);

    const handleRequestPermissions = async () => {
        if (!cameraPermission?.granted) await requestCameraPermission();
        if (!micPermission?.granted) await requestMicPermission();
    };

    const pinchGesture = Gesture.Pinch()
        .onBegin(() => {
            baseZoomRef.current = zoom;
        })
        .onUpdate((event) => {
            const next = Math.min(Math.max(baseZoomRef.current + (event.scale - 1) * 0.5, 0), 1);
            runOnJS(setZoom)(next);
        });

    const toggleQuickZoom = () => setZoom((prev) => (prev === 0 ? 0.25 : 0));

    const handleShutterPress = async () => {
        if (!cameraRef.current || isBusy) return;

        if (captureMode === 'photo') {
            setIsBusy(true);
            try {
                const photo = await cameraRef.current.takePictureAsync({ exif: false });
                if (photo?.uri) {
                    const fixed = await ImageManipulator.manipulateAsync(
                        photo.uri,
                        [],
                        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
                    );
                    setCapturedMedia({ uri: fixed.uri, type: 'image' });
                }
            } catch (e) {
                console.warn('Error taking photo:', e);
            } finally {
                setIsBusy(false);
            }
            return;
        }

        // Video
        if (isRecording) {
            cameraRef.current.stopRecording();
            return;
        }

        if (!micPermission?.granted) {
            const res = await requestMicPermission();
            if (!res.granted) return;
        }

        setIsRecording(true);
        try {
            const video = await cameraRef.current.recordAsync({ maxDuration: MAX_VIDEO_SECONDS, codec: 'avc1' });
            if (video?.uri) setCapturedMedia({ uri: video.uri, type: 'video' });
        } catch (e) {
            console.warn('Error recording video:', e);
        } finally {
            setIsRecording(false);
        }
    };

    const pickFromGallery = async () => {
        if (isRecording) return;
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: captureMode === 'photo' ? ['images'] : ['videos'],
            quality: 0.8,
            videoMaxDuration: MAX_VIDEO_SECONDS,
        });
        if (!result.canceled && result.assets[0]?.uri) {
            const asset = result.assets[0];
            setCapturedMedia({ uri: asset.uri, type: asset.type === 'video' ? 'video' : 'image' });
        }
    };

    const toggleCameraFacing = () => {
        if (isRecording) return;
        setZoom(0);
        setFacing((c) => (c === 'back' ? 'front' : 'back'));
    };

    const send = (option?: 'image-view-once') => {
        if (!capturedMedia) return;
        onSend(capturedMedia.uri, capturedMedia.type, option);
        setCapturedMedia(null);
        onClose();
    };

    if (!cameraPermission || !micPermission) return <View />;
    if (!cameraPermission.granted || (captureMode === 'video' && !micPermission.granted)) {
        return (
            <PermissionRequest
                visible={visible}
                icon="camera.fill"
                title="Camera Access"
                subtitle="Nimly needs access to your camera and microphone to capture photos and videos."
                confirmLabel="Allow Access"
                onRequest={handleRequestPermissions}
                onClose={onClose}
            />
        );
    }

    const isVideoMode = captureMode === 'video';
    const remaining = Math.max(0, MAX_VIDEO_SECONDS - elapsed);

    return (
        <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
            <View style={styles.container}>
                {!capturedMedia ? (
                    <View style={styles.camera}>
                        <GestureDetector gesture={pinchGesture}>
                            <View style={StyleSheet.absoluteFill}>
                                <CameraView
                                    style={StyleSheet.absoluteFill}
                                    facing={facing}
                                    ref={cameraRef}
                                    mode={isVideoMode ? 'video' : 'picture'}
                                    zoom={zoom}
                                    flash={flash}
                                    enableTorch={isVideoMode && flash === 'on'}
                                    videoQuality="480p"
                                />
                            </View>
                        </GestureDetector>

                        {/* Barra superior */}
                        <View style={[styles.topBar, { top: insets.top + 6 }]} pointerEvents="box-none">
                            <TouchableOpacity style={styles.iconBtn} onPress={onClose} hitSlop={8}>
                                <SymbolView name="xmark" size={22} tintColor="#fff" />
                            </TouchableOpacity>

                            {isRecording ? (
                                <View style={styles.recPill}>
                                    <View style={styles.recDot} />
                                    <Text style={styles.recText}>{fmtTime(remaining)}</Text>
                                </View>
                            ) : (
                                <View style={{ flex: 1 }} />
                            )}

                            <TouchableOpacity
                                style={styles.iconBtn}
                                onPress={() => setFlash((f) => (f === 'off' ? 'on' : 'off'))}
                                hitSlop={8}
                            >
                                <SymbolView name={flash === 'on' ? 'bolt.fill' : 'bolt.slash.fill'} size={20} tintColor="#fff" />
                            </TouchableOpacity>
                        </View>

                        {/* Zoom rápido */}
                        {!isRecording && (
                            <TouchableOpacity style={styles.zoomBadge} onPress={toggleQuickZoom} activeOpacity={0.8}>
                                <Text style={styles.zoomText}>{zoom === 0 ? '1x' : `${(1 + zoom * 4).toFixed(1)}x`}</Text>
                            </TouchableOpacity>
                        )}

                        {/* Controles inferiores */}
                        <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 24 }]}>
                            <CameraModeSelector
                                activeMode={captureMode}
                                onModeChange={(m) => {
                                    if (isRecording) return;
                                    setCaptureMode(m);
                                }}
                                tintColor={getThemeColor('tint')}
                                disabled={isRecording}
                            />

                            <View style={styles.shutterRow}>
                                <TouchableOpacity
                                    onPress={pickFromGallery}
                                    style={[styles.sideBtn, isRecording && styles.sideBtnHidden]}
                                    disabled={isRecording}
                                >
                                    <SymbolView name="photo.on.rectangle" size={26} tintColor="#fff" />
                                </TouchableOpacity>

                                <TouchableOpacity onPress={handleShutterPress} activeOpacity={0.8} disabled={isBusy}>
                                    <View
                                        style={[
                                            styles.shutterOuter,
                                            isVideoMode && styles.shutterOuterVideo,
                                            isRecording && styles.shutterOuterRecording,
                                        ]}
                                    >
                                        <View
                                            style={[
                                                styles.shutterInner,
                                                isVideoMode && styles.shutterInnerVideo,
                                                isRecording && styles.shutterInnerRecording,
                                            ]}
                                        />
                                    </View>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={toggleCameraFacing}
                                    style={[styles.sideBtn, isRecording && styles.sideBtnHidden]}
                                    disabled={isRecording}
                                >
                                    <SymbolView name="arrow.triangle.2.circlepath.camera" size={26} tintColor="#fff" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                ) : (
                    <View style={styles.previewContainer}>
                        {capturedMedia.type === 'image' ? (
                            <Image source={{ uri: capturedMedia.uri }} style={styles.previewMedia} resizeMode="cover" />
                        ) : (
                            <VideoView
                                player={videoPlayer}
                                style={styles.previewMedia}
                                nativeControls={false}
                                contentFit="cover"
                            />
                        )}

                        <TouchableOpacity
                            style={[styles.iconBtn, { position: 'absolute', top: insets.top + 6, left: 16 }]}
                            onPress={() => setCapturedMedia(null)}
                            hitSlop={8}
                        >
                            <SymbolView name="chevron.left" size={22} tintColor="#fff" />
                        </TouchableOpacity>

                        {mode === 'story' ? (
                            <GlassView style={[styles.simplePanel, { bottom: insets.bottom + 20 }]}>
                                <TouchableOpacity style={styles.simpleBtn} onPress={() => send()}>
                                    <SymbolView name="paperplane.fill" size={20} tintColor={getThemeColor('tint')} />
                                    <Text style={[styles.decisionText, styles.decisionTextTint]}>Share to Story</Text>
                                </TouchableOpacity>
                            </GlassView>
                        ) : mode === 'simple' ? (
                            <GlassView style={[styles.simplePanel, { bottom: insets.bottom + 20 }]}>
                                <TouchableOpacity style={styles.simpleBtn} onPress={() => send()}>
                                    <SymbolView name="checkmark.circle.fill" size={20} tintColor={getThemeColor('tint')} />
                                    <Text style={[styles.decisionText, styles.decisionTextTint]}>Use File</Text>
                                </TouchableOpacity>
                            </GlassView>
                        ) : (
                            <GlassView style={[styles.decisionPanel, { bottom: insets.bottom + 20 }]}>
                                <TouchableOpacity style={styles.decisionBtn} onPress={() => send()}>
                                    <SymbolView name="infinity" size={22} tintColor="#fff" />
                                    <Text style={styles.decisionText}>Send to Chat</Text>
                                </TouchableOpacity>

                                <View style={styles.separator} />

                                <TouchableOpacity
                                    style={[styles.decisionBtn, capturedMedia.type === 'video' && styles.decisionBtnDisabled]}
                                    onPress={() => send('image-view-once')}
                                    disabled={capturedMedia.type === 'video'}
                                >
                                    <SymbolView
                                        name="eye.fill"
                                        size={22}
                                        tintColor={capturedMedia.type === 'video' ? '#555' : getThemeColor('tint')}
                                    />
                                    <Text
                                        style={[
                                            styles.decisionText,
                                            capturedMedia.type === 'video' ? styles.decisionTextMuted : styles.decisionTextTint,
                                        ]}
                                    >
                                        View Once
                                    </Text>
                                </TouchableOpacity>
                            </GlassView>
                        )}
                    </View>
                )}
            </View>
        </Modal>
    );
}
