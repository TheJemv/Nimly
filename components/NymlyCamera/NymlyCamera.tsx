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

// Videos are encrypted E2EE (base64 in memory), so they're limited in
// duration and resolution to keep the blob manageable.
const MAX_VIDEO_SECONDS = 12;

// Quick-zoom button level (expo-camera's `zoom` prop is normalized 0..1, not
// a real optical multiplier, so the label is approximate).
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
    // Video preview: strip the audio before sending.
    const [muteAudio, setMuteAudio] = useState(false);
    const [isStripping, setIsStripping] = useState(false);

    const [zoom, setZoom] = useState(0);
    const baseZoomRef = useRef(0);
    const cameraRef = useRef<CameraView>(null);
    // Set to true if the camera closes while recording: the recordAsync
    // promise resolves later and we don't want to open the preview for that clip.
    const discardRecordingRef = useRef(false);
    // Prevents a quick double-tap from starting two recordings (the isRecording
    // state arrives one frame late).
    const startingRecordingRef = useRef(false);

    const videoPlayer = useVideoPlayer(
        capturedMedia?.type === 'video' ? capturedMedia.uri : null,
        (player) => {
            player.loop = true;
            player.muted = false;
            player.play();
        }
    );

    // Recording timer.
    useEffect(() => {
        if (!isRecording) {
            setElapsed(0);
            return;
        }
        const id = setInterval(() => setElapsed((e) => e + 1), 1000);
        return () => clearInterval(id);
    }, [isRecording]);

    // Autoplay the video preview (the useVideoPlayer callback only runs on
    // mount, not when the source changes).
    useEffect(() => {
        if (capturedMedia?.type === 'video' && videoPlayer) {
            try {
                videoPlayer.loop = true;
                videoPlayer.play();
            } catch { /* non-critical preview */ }
        }
    }, [capturedMedia, videoPlayer]);

    // The preview reflects the "remove audio" toggle.
    useEffect(() => {
        try { if (videoPlayer) videoPlayer.muted = muteAudio; } catch { /* non-critical preview */ }
    }, [muteAudio, videoPlayer, capturedMedia]);

    // On close/reopen, go back to a clean camera.
    useEffect(() => {
        if (!visible) {
            setCapturedMedia(null);
            setIsRecording(false);
            setZoom(0);
            setMuteAudio(false);
        }
    }, [visible]);

    // Safety net: if the component unmounts with a live recording, stop it
    // so the native module doesn't keep recording.
    useEffect(() => {
        return () => {
            try { cameraRef.current?.stopRecording(); } catch { /* no-op */ }
        };
    }, []);

    const handleRequestPermissions = async () => {
        if (!cameraPermission?.granted) await requestCameraPermission();
        if (!micPermission?.granted) await requestMicPermission();
    };

    // Closing the camera: if a recording is in progress, stop it first
    // (otherwise the native module keeps recording and the promise never resolves).
    const handleClose = () => {
        if (isRecording) {
            discardRecordingRef.current = true;
            try { cameraRef.current?.stopRecording(); } catch { /* already stopped */ }
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
                    // Width cap so we don't drag along the camera's ~4000px RAW,
                    // but q0.92 to keep it sharp (0.8 used to wash it out).
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

        // Anti-double-tap: `isRecording` (state) arrives late, so a quick second
        // tap used to fire a recordAsync on top of one already in progress.
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
            // High-res source; compressVideoForUpload downscales it later to
            // upload specs. Resolution/bitrate are set via CameraView's props
            // (videoQuality / videoBitrate) — the codec does go here (iOS
            // requirement for videoBitrate to take effect).
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
                // Video: 1 = no lossy pre-compression from the picker (our
                // pipeline compresses it well). Photo: near-max, then normalized on upload.
                quality: captureMode === 'photo' ? 0.95 : 1,
                // Native editor: video trimming on iOS + enforces the duration
                // cap (without this, videoMaxDuration is ignored when picking from the gallery).
                allowsEditing: captureMode === 'video',
                videoMaxDuration: MAX_VIDEO_SECONDS,
                // Passthrough: compressVideoForUpload does the only transcode
                // (720p + HDR->SDR tone-map). See new-post.tsx.
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
    // We only block on the camera. The microphone permission is requested
    // lazily when tapping record, so missing mic permission shouldn't block
    // the whole camera (you could still take photos).
    if (!cameraPermission.granted) {
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

                        {/* Top bar */}
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

                        {/* Quick zoom — sits in the flow, right above the controls
                            bar, so it never overlaps it (it used to have a fixed
                            `bottom` that sat on top of the mode selector). */}
                        {!isRecording && (
                            <TouchableOpacity style={styles.zoomBadge} onPress={toggleQuickZoom} activeOpacity={0.8}>
                                <Text style={styles.zoomText}>{zoomLabel}</Text>
                            </TouchableOpacity>
                        )}

                        {/* Bottom controls */}
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
