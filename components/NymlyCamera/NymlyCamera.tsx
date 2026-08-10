// components/NymlyCamera.tsx
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { GlassView } from 'expo-glass-effect';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { SymbolView } from 'expo-symbols';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import {
    Image,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import PermissionRequest from '@/components/PermissionRequest';
import { getThemeColor } from '@/constants/theme';
import CameraModeSelector, { CameraCaptureMode } from '../CameraModeSelector/CameraModeSelector';
import { styles } from './NimlyCamera.styles';

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

export default function NymlyCamera({
    visible,
    onClose,
    onSend,
    mode = 'chat',
}: NymlyCameraProps) {
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();
    const [micPermission, requestMicPermission] = useMicrophonePermissions();

    const [captureMode, setCaptureMode] = useState<CameraCaptureMode>('photo');
    const [facing, setFacing] = useState<'back' | 'front'>('back');
    const [capturedMedia, setCapturedMedia] = useState<CapturedMedia | null>(null);
    const [isRecording, setIsRecording] = useState(false);

    // 🔍 ESTADO DE ZOOM (0.0 a 1.0)
    const [zoom, setZoom] = useState(0);
    const baseZoomRef = useRef(0);

    const cameraRef = useRef<CameraView>(null);

    // Reproductor de Video
    const videoPlayer = useVideoPlayer(capturedMedia?.type === 'video' ? capturedMedia.uri : null, player => {
        player.loop = true;
        player.play();
    });

    // Reproducción automática en bucle
    useEffect(() => {
        if (capturedMedia?.type === 'video' && capturedMedia.uri && videoPlayer) {
            try {
                // videoPlayer.replace(capturedMedia.uri);
                // videoPlayer.loop = true;
                // videoPlayer.play();

            } catch (e) {
                console.warn("Error al reproducir vista previa de video:", e);
            }
        }
    }, [capturedMedia, videoPlayer]);

    const handleRequestPermissions = async () => {
        if (!cameraPermission?.granted) await requestCameraPermission();
        if (!micPermission?.granted) await requestMicPermission();
    };

    // 🤌 GESTO DE PELLIZCO (PINCH TO ZOOM)
    const pinchGesture = Gesture.Pinch()
        .onBegin(() => {
            baseZoomRef.current = zoom;
        })
        .onUpdate((event) => {
            // Sensibilidad ajustada para que el zoom sea progresivo
            const scaleDelta = (event.scale - 1) * 0.5;
            const newZoom = Math.min(Math.max(baseZoomRef.current + scaleDelta, 0), 1);
            runOnJS(setZoom)(newZoom);
        });

    // Alternar zoom rápido entre 1x y 2x (0 y 0.25 en escala de Expo Camera)
    const toggleQuickZoom = () => {
        setZoom((prev) => (prev === 0 ? 0.25 : 0));
    };

    // --- DISPARADOR ---
    const handleShutterPress = async () => {
        if (!cameraRef.current) return;

        if (captureMode === 'photo') {
            try {
                const photo = await cameraRef.current.takePictureAsync({ exif: true });
                if (photo) {
                    const fixed = await ImageManipulator.manipulateAsync(
                        photo.uri,
                        [],
                        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
                    );
                    setCapturedMedia({ uri: fixed.uri, type: 'image' });
                }
            } catch (e) {
                console.warn("Error al tomar foto:", e);
            }
        } else {
            if (isRecording) {
                cameraRef.current.stopRecording();
                setIsRecording(false);
            } else {
                if (!micPermission?.granted) {
                    const res = await requestMicPermission();
                    if (!res.granted) return;
                }

                setIsRecording(true);
                try {
                    const video = await cameraRef.current.recordAsync({ maxDuration: 15 });
                    if (video?.uri) {
                        setCapturedMedia({ uri: video.uri, type: 'video' });
                    }
                } catch (e) {
                    console.warn("Error grabacion video:", e);
                } finally {
                    setIsRecording(false);
                }
            }
        }
    };

    const pickFromGallery = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: captureMode === 'photo' ? ['images'] : ['videos'],
            quality: 0.8,
            videoMaxDuration: 15,
        });

        if (!result.canceled && result.assets[0].uri) {
            const asset = result.assets[0];
            setCapturedMedia({
                uri: asset.uri,
                type: asset.type === 'video' ? 'video' : 'image',
            });
        }
    };

    const toggleCameraFacing = () => {
        setZoom(0); // Reset de zoom al voltear la cámara
        setFacing((current) => (current === 'back' ? 'front' : 'back'));
    };

    if (!cameraPermission || !micPermission) return <View />;
    if (!cameraPermission.granted || (captureMode === 'video' && !micPermission.granted)) {
        return (
            <PermissionRequest
                visible={visible}
                icon="camera.fill"
                title="Acceso a Cámara"
                subtitle="Nimly necesita acceso a tu cámara y micrófono para capturar historias."
                confirmLabel="Permitir Acceso"
                onRequest={handleRequestPermissions}
                onClose={onClose}
            />
        );
    }

    return (
        <Modal visible={visible} animationType="slide" transparent={false}>
            <View style={styles.container}>
                {!capturedMedia ? (
                    <View style={styles.camera}>
                        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                            <SymbolView name="xmark" size={24} tintColor="#fff" />
                        </TouchableOpacity>

                        {/* ENVOLTORIO CON GESTO DE ZOOM */}
                        <GestureDetector gesture={pinchGesture}>
                            <View style={styles.fullCamera}>
                                <CameraView
                                    style={StyleSheet.absoluteFill}
                                    facing={facing}
                                    ref={cameraRef}
                                    mode={captureMode === 'photo' ? 'picture' : 'video'}
                                    zoom={zoom} // 👈 PROP DE ZOOM APLICADO
                                />
                            </View>
                        </GestureDetector>

                        {/* BOTÓN INSIGNIA DE ZOOM (1x / 2x) */}
                        <TouchableOpacity
                            style={styles.zoomBadge}
                            onPress={toggleQuickZoom}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.zoomText}>
                                {zoom === 0 ? '1x' : `${(1 + zoom * 4).toFixed(1)}x`}
                            </Text>
                        </TouchableOpacity>

                        {/* CONTROLES INFERIORES */}
                        <View style={styles.bottomControls}>
                            <CameraModeSelector
                                activeMode={captureMode}
                                onModeChange={(newMode) => {
                                    if (isRecording) cameraRef.current?.stopRecording();
                                    setCaptureMode(newMode);
                                }}
                                tintColor={getThemeColor('tint')}
                            />

                            <View style={styles.shutterRow}>
                                <TouchableOpacity onPress={pickFromGallery} style={styles.sideBtn}>
                                    <SymbolView name="photo.on.rectangle" size={28} tintColor="#fff" />
                                </TouchableOpacity>

                                <TouchableOpacity onPress={handleShutterPress} activeOpacity={0.8}>
                                    <View
                                        style={[
                                            styles.shutterOuter,
                                            captureMode === 'video' && styles.shutterOuterVideo,
                                            isRecording && styles.shutterOuterRecording,
                                        ]}
                                    >
                                        <View
                                            style={[
                                                styles.shutterInner,
                                                captureMode === 'video' && styles.shutterInnerVideo,
                                                isRecording && styles.shutterInnerRecording,
                                            ]}
                                        />
                                    </View>
                                </TouchableOpacity>

                                <TouchableOpacity onPress={toggleCameraFacing} style={styles.sideBtn}>
                                    <SymbolView
                                        name="arrow.triangle.2.circlepath.camera"
                                        size={28}
                                        tintColor="#fff"
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                ) : (
                    <View style={styles.previewContainer}>
                        {capturedMedia.type === 'image' ? (
                            <Image source={{ uri: capturedMedia.uri }} style={styles.previewMedia} />
                        ) : (
                            <VideoView
                                player={videoPlayer}
                                style={styles.previewMedia}
                                nativeControls={false}
                            />
                        )}

                        <TouchableOpacity style={styles.closeBtn} onPress={() => setCapturedMedia(null)}>
                            <SymbolView name="chevron.left" size={24} tintColor="#fff" />
                        </TouchableOpacity>

                        {mode === 'story' ? (
                            <GlassView style={styles.simplePanel}>
                                <TouchableOpacity
                                    style={styles.simpleBtn}
                                    onPress={() => {
                                        onSend(capturedMedia.uri, capturedMedia.type);
                                        setCapturedMedia(null);
                                        onClose();
                                    }}
                                >
                                    <SymbolView name="paperplane.fill" size={20} tintColor={getThemeColor('tint')} />
                                    <Text style={[styles.decisionText, { color: getThemeColor('tint'), fontWeight: 'bold' }]}>
                                        Compartir en Historia
                                    </Text>
                                </TouchableOpacity>
                            </GlassView>
                        ) : mode === 'simple' ? (
                            <GlassView style={styles.simplePanel}>
                                <TouchableOpacity
                                    style={styles.simpleBtn}
                                    onPress={() => {
                                        onSend(capturedMedia.uri, capturedMedia.type);
                                        setCapturedMedia(null);
                                        onClose();
                                    }}
                                >
                                    <SymbolView name="checkmark.circle.fill" size={20} tintColor={getThemeColor('tint')} />
                                    <Text style={[styles.decisionText, { color: getThemeColor('tint') }]}>
                                        Usar Archivo
                                    </Text>
                                </TouchableOpacity>
                            </GlassView>
                        ) : (
                            <GlassView style={styles.decisionPanel}>
                                <TouchableOpacity
                                    style={styles.decisionBtn}
                                    onPress={() => {
                                        onSend(capturedMedia.uri, capturedMedia.type);
                                        setCapturedMedia(null);
                                        onClose();
                                    }}
                                >
                                    <SymbolView name="infinity" size={24} tintColor="#fff" />
                                    <Text style={styles.decisionText}>Enviar al Chat</Text>
                                </TouchableOpacity>

                                <View style={styles.separator} />

                                <TouchableOpacity
                                    style={styles.decisionBtn}
                                    onPress={() => {
                                        onSend(capturedMedia.uri, capturedMedia.type, 'image-view-once');
                                        setCapturedMedia(null);
                                        onClose();
                                    }}
                                >
                                    <SymbolView name="eye.fill" size={24} tintColor={getThemeColor('tint')} />
                                    <Text style={[styles.decisionText, { color: getThemeColor('tint') }]}>
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