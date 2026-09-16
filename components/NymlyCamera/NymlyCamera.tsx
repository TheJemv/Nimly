// components/NymlyCamera.tsx
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { GlassView } from 'expo-glass-effect';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { SymbolView } from 'expo-symbols';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PermissionRequest from '@/components/PermissionRequest';
import { getThemeColor } from '@/constants/theme';
import { stripVideoAudio } from '@/utils/compressVideo';
import CameraModeSelector, { CameraCaptureMode } from '../CameraModeSelector/CameraModeSelector';
import { styles } from './NimlyCamera.styles';

// Los videos se cifran E2EE (base64 en memoria), así que se limitan en
// duración y resolución para que el blob sea manejable.
const MAX_VIDEO_SECONDS = 12;

// Zoom del botón rápido (el prop `zoom` de expo-camera es 0..1 normalizado, no
// un multiplicador óptico real, así que la etiqueta es aproximada).
const QUICK_ZOOM = 0.5;

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
    // Preview de video: quitar el audio antes de enviar.
    const [muteAudio, setMuteAudio] = useState(false);
    const [isStripping, setIsStripping] = useState(false);

    const [zoom, setZoom] = useState(0);
    const baseZoomRef = useRef(0);
    const cameraRef = useRef<CameraView>(null);
    // Se pone en true si se cierra la cámara mientras graba: la promesa de
    // recordAsync resuelve después y no queremos abrir la preview de ese clip.
    const discardRecordingRef = useRef(false);
    // Evita que un doble-tap rápido lance dos grabaciones (el estado isRecording
    // llega un frame tarde).
    const startingRecordingRef = useRef(false);

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

    // La preview refleja el toggle de "quitar audio".
    useEffect(() => {
        try { if (videoPlayer) videoPlayer.muted = muteAudio; } catch { /* preview no crítica */ }
    }, [muteAudio, videoPlayer, capturedMedia]);

    // Al cerrar / reabrir, volvemos a la cámara limpia.
    useEffect(() => {
        if (!visible) {
            setCapturedMedia(null);
            setIsRecording(false);
            setZoom(0);
            setMuteAudio(false);
        }
    }, [visible]);

    // Red de seguridad: si el componente se desmonta con una grabación viva,
    // pararla para que el módulo nativo no se quede grabando.
    useEffect(() => {
        return () => {
            try { cameraRef.current?.stopRecording(); } catch { /* no-op */ }
        };
    }, []);

    const handleRequestPermissions = async () => {
        if (!cameraPermission?.granted) await requestCameraPermission();
        if (!micPermission?.granted) await requestMicPermission();
    };

    // Cerrar la cámara: si hay una grabación en curso hay que pararla primero
    // (si no, el módulo nativo queda grabando y la promesa nunca resuelve).
    const handleClose = () => {
        if (isRecording) {
            discardRecordingRef.current = true;
            try { cameraRef.current?.stopRecording(); } catch { /* ya parada */ }
        }
        onClose();
    };

    const pinchGesture = Gesture.Pinch()
        .onBegin(() => {
            baseZoomRef.current = zoom;
        })
        .onUpdate((event) => {
            const next = Math.min(Math.max(baseZoomRef.current + (event.scale - 1) * 0.5, 0), 1);
            runOnJS(setZoom)(next);
        });

    const toggleQuickZoom = () => setZoom((prev) => (prev === 0 ? QUICK_ZOOM : 0));
    const zoomLabel = zoom === 0 ? '1x' : `${(1 + zoom * 2).toFixed(1)}x`;

    const handleShutterPress = async () => {
        if (!cameraRef.current || isBusy) return;

        if (captureMode === 'photo') {
            setIsBusy(true);
            try {
                const photo = await cameraRef.current.takePictureAsync({ exif: false });
                if (photo?.uri) {
                    // Tope de ancho para no arrastrar el RAW de ~4000px de la
                    // cámara, pero q0.92 para que se vea nítido (antes 0.8 lavaba).
                    const tooWide = (photo.width ?? 0) > 2400;
                    const fixed = await ImageManipulator.manipulateAsync(
                        photo.uri,
                        tooWide ? [{ resize: { width: 2400 } }] : [],
                        { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
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

        // Anti-doble-tap: `isRecording` (estado) llega tarde, así que un segundo
        // toque rápido lanzaba un recordAsync sobre otro ya en curso.
        if (startingRecordingRef.current) return;
        startingRecordingRef.current = true;

        if (!micPermission?.granted) {
            const res = await requestMicPermission();
            if (!res.granted) {
                startingRecordingRef.current = false;
                return;
            }
        }

        discardRecordingRef.current = false;
        setIsRecording(true);
        try {
            // Fuente en alta; compressVideoForUpload la baja luego a specs de
            // subida. La resolución/bitrate se fijan en los props de CameraView
            // (videoQuality / videoBitrate) — el codec sí va aquí (requisito iOS
            // para que videoBitrate surta efecto).
            const video = await cameraRef.current.recordAsync({
                maxDuration: MAX_VIDEO_SECONDS,
                codec: 'avc1',
            });
            if (video?.uri && !discardRecordingRef.current) {
                setCapturedMedia({ uri: video.uri, type: 'video' });
            }
        } catch (e) {
            console.warn('Error recording video:', e);
        } finally {
            discardRecordingRef.current = false;
            startingRecordingRef.current = false;
            setIsRecording(false);
        }
    };

    const pickFromGallery = async () => {
        if (isRecording) return;
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: captureMode === 'photo' ? ['images'] : ['videos'],
                // Video: 1 = sin pre-compresión lossy del picker (nuestro pipeline
                // lo comprime bien). Foto: casi máx, luego se normaliza al subir.
                quality: captureMode === 'photo' ? 0.95 : 1,
                // Editor nativo: recorte de video en iOS + hace respetar el tope de
                // duración (sin esto, videoMaxDuration se ignora al elegir de galería).
                allowsEditing: captureMode === 'video',
                videoMaxDuration: MAX_VIDEO_SECONDS,
                // Passthrough: compressVideoForUpload hace el único transcode (720p +
                // tone-map HDR->SDR). Ver new-post.tsx.
            });
            if (!result.canceled && result.assets[0]?.uri) {
                const asset = result.assets[0];
                setCapturedMedia({ uri: asset.uri, type: asset.type === 'video' ? 'video' : 'image' });
            }
        } catch (e) {
            console.warn('Error picking media:', e);
        }
    };

    const toggleCameraFacing = () => {
        if (isRecording) return;
        setZoom(0);
        setFacing((c) => (c === 'back' ? 'front' : 'back'));
    };

    const send = async (option?: 'image-view-once') => {
        if (!capturedMedia || isStripping) return;

        let uri = capturedMedia.uri;
        if (capturedMedia.type === 'video' && muteAudio) {
            setIsStripping(true);
            try {
                uri = await stripVideoAudio(capturedMedia.uri);
            } finally {
                setIsStripping(false);
            }
        }

        onSend(uri, capturedMedia.type, option);
        setCapturedMedia(null);
        setMuteAudio(false);
        onClose();
    };

    if (!cameraPermission || !micPermission) return <View />;
    // Solo bloqueamos por la cámara. El micrófono se pide de forma diferida al
    // pulsar grabar, así que faltar el permiso de mic no debe tapar toda la
    // cámara (podías seguir tomando fotos).
    if (!cameraPermission.granted) {
        return (
            <PermissionRequest
                visible={visible}
                icon="camera.fill"
                title="Camera Access"
                subtitle="Nimly needs access to your camera and microphone to capture photos and videos."
                confirmLabel="Continue"
                onRequest={handleRequestPermissions}
                onClose={onClose}
            />
        );
    }

    const isVideoMode = captureMode === 'video';
    const remaining = Math.max(0, MAX_VIDEO_SECONDS - elapsed);

    return (
        <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleClose}>
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
                                    videoQuality="1080p"
                                    videoBitrate={12_000_000}
                                />
                            </View>
                        </GestureDetector>

                        {/* Barra superior */}
                        <View style={[styles.topBar, { top: insets.top + 6 }]} pointerEvents="box-none">
                            <TouchableOpacity
                                style={styles.iconBtn}
                                onPress={handleClose}
                                hitSlop={8}
                                accessibilityRole="button"
                                accessibilityLabel="Close camera"
                            >
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
                                accessibilityRole="button"
                                accessibilityLabel={flash === 'on' ? 'Flash on' : 'Flash off'}
                            >
                                <SymbolView name={flash === 'on' ? 'bolt.fill' : 'bolt.slash.fill'} size={20} tintColor="#fff" />
                            </TouchableOpacity>
                        </View>

                        {/* Zoom rápido — va en el flujo, justo encima de la barra
                            de controles, para que nunca la tape (antes tenía un
                            `bottom` fijo que se montaba sobre el selector de modo). */}
                        {!isRecording && (
                            <TouchableOpacity style={styles.zoomBadge} onPress={toggleQuickZoom} activeOpacity={0.8}>
                                <Text style={styles.zoomText}>{zoomLabel}</Text>
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
                                    accessibilityRole="button"
                                    accessibilityLabel="Choose from library"
                                >
                                    <SymbolView name="photo.on.rectangle" size={26} tintColor="#fff" />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={handleShutterPress}
                                    activeOpacity={0.8}
                                    disabled={isBusy}
                                    accessibilityRole="button"
                                    accessibilityLabel={
                                        isVideoMode ? (isRecording ? 'Stop recording' : 'Start recording') : 'Take photo'
                                    }
                                >
                                    <View
                                        style={[
                                            styles.shutterOuter,
                                            isVideoMode && styles.shutterOuterVideo,
                                            isRecording && styles.shutterOuterRecording,
                                            isBusy && styles.shutterBusy,
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
                                    accessibilityRole="button"
                                    accessibilityLabel="Flip camera"
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
                            onPress={() => { setCapturedMedia(null); setMuteAudio(false); }}
                            hitSlop={8}
                            disabled={isStripping}
                            accessibilityRole="button"
                            accessibilityLabel="Retake"
                        >
                            <SymbolView name="chevron.left" size={22} tintColor="#fff" />
                        </TouchableOpacity>

                        {capturedMedia.type === 'video' && (
                            <TouchableOpacity
                                style={[
                                    styles.iconBtn,
                                    { position: 'absolute', top: insets.top + 6, right: 16 },
                                    muteAudio && styles.iconBtnActive,
                                ]}
                                onPress={() => setMuteAudio((m) => !m)}
                                hitSlop={8}
                                disabled={isStripping}
                                accessibilityRole="button"
                                accessibilityLabel={muteAudio ? 'Audio off — tap to keep audio' : 'Remove audio'}
                            >
                                <SymbolView
                                    name={muteAudio ? 'speaker.slash.fill' : 'speaker.wave.2.fill'}
                                    size={19}
                                    tintColor="#fff"
                                />
                            </TouchableOpacity>
                        )}

                        {mode === 'story' ? (
                            <GlassView style={[styles.simplePanel, { bottom: insets.bottom + 20 }]}>
                                <TouchableOpacity style={styles.simpleBtn} onPress={() => send()} disabled={isStripping}>
                                    <SymbolView name="paperplane.fill" size={20} tintColor={getThemeColor('tint')} />
                                    <Text style={[styles.decisionText, styles.decisionTextTint]}>Share to Story</Text>
                                </TouchableOpacity>
                            </GlassView>
                        ) : mode === 'simple' ? (
                            <GlassView style={[styles.simplePanel, { bottom: insets.bottom + 20 }]}>
                                <TouchableOpacity style={styles.simpleBtn} onPress={() => send()} disabled={isStripping}>
                                    <SymbolView name="checkmark.circle.fill" size={20} tintColor={getThemeColor('tint')} />
                                    <Text style={[styles.decisionText, styles.decisionTextTint]}>Use File</Text>
                                </TouchableOpacity>
                            </GlassView>
                        ) : (
                            <GlassView style={[styles.decisionPanel, { bottom: insets.bottom + 20 }]}>
                                <TouchableOpacity style={styles.decisionBtn} onPress={() => send()} disabled={isStripping}>
                                    <SymbolView name="infinity" size={22} tintColor="#fff" />
                                    <Text style={styles.decisionText}>Send to Chat</Text>
                                </TouchableOpacity>

                                <View style={styles.separator} />

                                <TouchableOpacity
                                    style={[styles.decisionBtn, capturedMedia.type === 'video' && styles.decisionBtnDisabled]}
                                    onPress={() => send('image-view-once')}
                                    disabled={capturedMedia.type === 'video' || isStripping}
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

                        {isStripping && (
                            <View style={styles.strippingOverlay}>
                                <ActivityIndicator color="#fff" />
                                <Text style={styles.strippingText}>Removing audio…</Text>
                            </View>
                        )}
                    </View>
                )}
            </View>
        </Modal>
    );
}
