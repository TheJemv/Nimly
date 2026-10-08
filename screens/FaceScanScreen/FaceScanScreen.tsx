import { useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, NativeSyntheticEvent, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FaceApiError, faceApi } from '@/api/face';
import PermissionRequest from '@/components/PermissionRequest';
import { getThemeColor } from '@/constants/theme';
import { FaceScanCamera, FaceScanCameraRef, FaceUpdate, isFaceScanAvailable } from '@/modules/face-scan';
import FaceConsent from './components/FaceConsent';
import ScanRing from './components/ScanRing';
import { styles } from './FaceScanScreen.styles';
import { Fit, headDirection, mostMissingSide, ovalFit, Side, TICK_COUNT, ticksAt } from './utils/scanGeometry';

type Phase = 'consent' | 'positioning' | 'scanning' | 'finishing' | 'uploading' | 'done' | 'failed';

// What went wrong, and whether the same video can be sent again (the server or
// the connection failed) or the user has to scan again (Nimly Face rejected it).
type Failure = { message: string; canResend: boolean };

// The face has to sit still in the oval this long before the scan starts.
const HOLD_MS = 500;
// Leaving the oval for less than this doesn't pause (Vision can blink out
// for a frame or two at wide angles).
const OUT_GRACE_MS = 350;
// No face events for this long (app backgrounded, camera stalled) counts as leaving.
const STALE_MS = 500;
// Head-pose smoothing (0..1, higher follows faster).
const SMOOTHING = 0.5;
// Nimly Face wants 5–30 s of video: a quick circle keeps recording until this
// much time was spent inside the oval.
const MIN_SCAN_MS = 5000;
// Gaps between face events longer than this aren't counted as scan time.
const MAX_EVENT_GAP_MS = 250;

const FIT_TEXT: Record<Fit, string> = {
    none: 'Position your face in the oval',
    'off-center': 'Center your face in the oval',
    'too-far': 'Move closer',
    'too-close': 'Move a little farther away',
    turned: 'Look straight at the screen',
    ok: 'Hold still…',
};

const SIDE_TEXT: Record<Side, string> = {
    right: 'Turn your head to the right',
    left: 'Turn your head to the left',
    up: 'Tilt your head up',
    down: 'Tilt your head down',
};

const emptyTicks = () => Array<boolean>(TICK_COUNT).fill(false);

const log = (message: string) => {
    if (__DEV__) console.log(`[face-scan] ${message}`);
};

export default function FaceScanScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const [permission, requestPermission] = useCameraPermissions();

    const cameraRef = useRef<FaceScanCameraRef>(null);
    const [phase, setPhase] = useState<Phase>('consent');
    const [consented, setConsented] = useState(false);
    const [fit, setFit] = useState<Fit>('none');
    const [lit, setLit] = useState<boolean[]>(emptyTicks);
    const [paused, setPaused] = useState(false);
    const [videoUri, setVideoUri] = useState<string | null>(null);
    const [failure, setFailure] = useState<Failure | null>(null);
    // Bumped on "Scan again" so the camera remounts with a fresh session.
    const [attempt, setAttempt] = useState(0);

    // Per-frame state lives in refs: face events arrive ~30 times a second and
    // only actual changes should re-render.
    const phaseRef = useRef<Phase>('consent');
    const litRef = useRef<boolean[]>(lit);
    const poseRef = useRef({ yaw: 0, pitch: 0 });
    // Head pose when the scan started: turns count from there, so holding the
    // phone low or off to a side doesn't light a side for free.
    const neutralRef = useRef({ yaw: 0, pitch: 0 });
    const okSinceRef = useRef<number | null>(null);
    const outSinceRef = useRef<number | null>(null);
    const pausedRef = useRef(false);
    const lastEventRef = useRef(0);
    // Time spent inside the oval while recording, and the last event that counted.
    const scanMsRef = useRef(0);
    const lastInsideRef = useRef<number | null>(null);

    const oval = useMemo(() => {
        const rx = Math.min(width * 0.36, 160);
        const ry = rx * 1.3;
        return { cx: width / 2, cy: insets.top + 64 + ry, rx, ry };
    }, [width, insets.top]);

    const videoPlayer = useVideoPlayer(videoUri, (player) => {
        player.loop = true;
        player.muted = true;
        player.play();
    });

    const goToPhase = (next: Phase) => {
        phaseRef.current = next;
        setPhase(next);
    };

    const fail = (next: Failure) => {
        log(`failed: ${next.message} (canResend=${next.canResend})`);
        setFailure(next);
        goToPhase('failed');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => { });
    };

    const setInside = useCallback((inside: boolean, now: number) => {
        if (inside) {
            outSinceRef.current = null;
            if (pausedRef.current) {
                pausedRef.current = false;
                setPaused(false);
                log('back in the oval, recording resumed');
                cameraRef.current?.resumeRecording();
            }
            return;
        }
        lastInsideRef.current = null;
        outSinceRef.current ??= now;
        if (!pausedRef.current && now - outSinceRef.current >= OUT_GRACE_MS) {
            pausedRef.current = true;
            setPaused(true);
            log('face left the oval, recording paused');
            cameraRef.current?.pauseRecording();
        }
    }, []);

    const upload = useCallback(async (uri: string) => {
        setFailure(null);
        goToPhase('uploading');
        log(`uploading ${uri} (consent=${consented})`);
        try {
            await faceApi.enroll(uri, consented);
            log('registered');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
            goToPhase('done');
        } catch (e: any) {
            const rescan = e instanceof FaceApiError && e.rescan;
            log(`upload failed: ${e?.message ?? e} (rescan=${rescan})`);
            fail({ message: e?.message ?? 'Something went wrong.', canResend: !rescan });
        }
    }, [consented]);

    const finish = useCallback(async () => {
        goToPhase('finishing');
        log(`circle complete after ${Math.round(scanMsRef.current / 100) / 10}s inside the oval, stopping recording`);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
        let uri: string;
        try {
            uri = await cameraRef.current!.stopRecording();
            log(`recorded ${uri}`);
        } catch (e: any) {
            log(`stopRecording failed: ${e?.message ?? e}`);
            fail({ message: e?.message ?? 'Could not save the scan.', canResend: false });
            return;
        }
        setVideoUri(uri);
        upload(uri);
    }, [upload]);

    const handleFaceUpdate = useCallback((event: NativeSyntheticEvent<FaceUpdate>) => {
        const face = event.nativeEvent;
        const now = Date.now();
        lastEventRef.current = now;

        if (phaseRef.current === 'positioning') {
            const next = ovalFit(face, oval, 'strict');
            setFit(next);
            if (next !== 'ok') {
                okSinceRef.current = null;
                return;
            }
            okSinceRef.current ??= now;
            if (now - okSinceRef.current < HOLD_MS || !face.hasFace) return;

            // Recording starts the moment the face settles in the oval.
            poseRef.current = { yaw: face.yaw, pitch: face.pitch };
            neutralRef.current = { yaw: face.yaw, pitch: face.pitch };
            scanMsRef.current = 0;
            lastInsideRef.current = now;
            goToPhase('scanning');
            log(`face in the oval, recording (yaw=${face.yaw.toFixed(2)} pitch=${face.pitch.toFixed(2)})`);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
            cameraRef.current?.startRecording();
            return;
        }

        if (phaseRef.current !== 'scanning') return;

        const inside = ovalFit(face, oval, 'loose') === 'ok';
        setInside(inside, now);
        if (!inside || !face.hasFace) return;

        if (lastInsideRef.current !== null) {
            scanMsRef.current += Math.min(now - lastInsideRef.current, MAX_EVENT_GAP_MS);
        }
        lastInsideRef.current = now;

        const pose = poseRef.current;
        pose.yaw += (face.yaw - pose.yaw) * SMOOTHING;
        pose.pitch += (face.pitch - pose.pitch) * SMOOTHING;

        const neutral = neutralRef.current;
        const direction = headDirection(pose.yaw - neutral.yaw, pose.pitch - neutral.pitch);
        if (direction !== null) {
            const ticks = ticksAt(direction);
            if (!ticks.every((i) => litRef.current[i])) {
                const next = [...litRef.current];
                ticks.forEach((i) => { next[i] = true; });
                litRef.current = next;
                setLit(next);
            }
        }

        if (litRef.current.every(Boolean) && scanMsRef.current >= MIN_SCAN_MS) finish();
    }, [oval, setInside, finish]);

    // Face events stop entirely when the app goes to the background or the
    // camera stalls: treat that as leaving the oval so the clip pauses.
    useEffect(() => {
        if (phase !== 'scanning') return;
        const id = setInterval(() => {
            const now = Date.now();
            if (now - lastEventRef.current > STALE_MS) setInside(false, now);
        }, 200);
        return () => clearInterval(id);
    }, [phase, setInside]);

    const handleCameraError = (event: NativeSyntheticEvent<{ message: string }>) => {
        fail({ message: event.nativeEvent.message, canResend: false });
    };

    const accept = () => {
        setConsented(true);
        goToPhase('positioning');
    };

    const restart = () => {
        litRef.current = emptyTicks();
        setLit(litRef.current);
        okSinceRef.current = null;
        outSinceRef.current = null;
        pausedRef.current = false;
        setPaused(false);
        setFit('none');
        setVideoUri(null);
        setFailure(null);
        setAttempt((n) => n + 1);
        goToPhase('positioning');
    };

    const close = () => router.back();

    // Reached on a binary without the camera (e.g. by link after an OTA update).
    if (!isFaceScanAvailable) {
        return (
            <View style={[styles.container, styles.unavailable]}>
                <SymbolView name="faceid" size={40} tintColor={getThemeColor('textSecondary')} />
                <Text style={styles.title}>Update Nimly to scan your face</Text>
                <TouchableOpacity style={styles.secondaryBtn} onPress={close}>
                    <Text style={styles.secondaryText}>Close</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (phase === 'consent') return <FaceConsent onAccept={accept} onDecline={close} />;

    if (!permission) return <View style={styles.container} />;

    if (!permission.granted) {
        return (
            <PermissionRequest
                visible
                icon="faceid"
                title="Camera Access"
                subtitle="Nimly needs your camera to scan your face."
                confirmLabel={permission.canAskAgain ? 'Continue' : 'Open Settings'}
                onRequest={permission.canAskAgain ? requestPermission : Linking.openSettings}
                onClose={close}
            />
        );
    }

    const showCamera = phase === 'positioning' || phase === 'scanning' || phase === 'finishing';
    const isRecording = phase === 'scanning' || phase === 'finishing';
    const ringComplete = lit.every(Boolean);
    const missingSide = mostMissingSide(lit);

    let title: string;
    let subtitle: string | null = null;
    switch (phase) {
        case 'positioning':
            title = FIT_TEXT[fit];
            break;
        case 'scanning':
            if (paused) title = 'Keep your face inside the oval';
            else if (ringComplete) title = 'Keep moving your head slowly…';
            else {
                title = 'Move your head slowly to complete the circle';
                subtitle = missingSide && SIDE_TEXT[missingSide];
            }
            break;
        case 'finishing':
        case 'uploading':
            title = 'Registering your face…';
            break;
        case 'done':
            title = 'Face registered';
            subtitle = 'Nimly Face can now recognize you.';
            break;
        case 'failed':
            title = "Couldn't register your face";
            subtitle = failure?.message ?? null;
            break;
    }

    const canResend = phase === 'failed' && !!failure?.canResend && !!videoUri;

    return (
        <View style={styles.container}>
            {showCamera && (
                <FaceScanCamera
                    key={attempt}
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    onFaceUpdate={handleFaceUpdate}
                    onCameraError={handleCameraError}
                />
            )}
            {!showCamera && videoUri && (
                <VideoView
                    player={videoPlayer}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    nativeControls={false}
                />
            )}

            <ScanRing
                width={width}
                height={height}
                oval={oval}
                lit={lit}
                active={phase !== 'positioning' && phase !== 'failed'}
            />

            <TouchableOpacity style={[styles.closeBtn, { top: insets.top + 12 }]} onPress={close} hitSlop={12}>
                <SymbolView name="xmark" size={22} tintColor="#fff" />
            </TouchableOpacity>

            {isRecording && (
                <View style={[styles.recordingPill, { top: insets.top + 14 }]}>
                    <View style={[styles.recordingDot, paused && styles.recordingDotPaused]} />
                    <Text style={styles.recordingText}>{paused ? 'Paused' : 'Recording'}</Text>
                </View>
            )}

            <View style={[styles.info, { top: oval.cy + oval.ry + 48 }]}>
                {phase === 'done' && (
                    <SymbolView name="checkmark.circle.fill" size={40} tintColor={getThemeColor('success')} />
                )}
                <Text style={styles.title}>{title}</Text>
                {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                {(phase === 'finishing' || phase === 'uploading') && (
                    <ActivityIndicator color="#fff" style={styles.spinner} />
                )}
            </View>

            {(phase === 'done' || phase === 'failed') && (
                <View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}>
                    {phase === 'done' && (
                        <TouchableOpacity style={styles.primaryBtn} onPress={close}>
                            <Text style={styles.primaryText}>Done</Text>
                        </TouchableOpacity>
                    )}
                    {canResend && (
                        <TouchableOpacity style={styles.primaryBtn} onPress={() => upload(videoUri!)}>
                            <Text style={styles.primaryText}>Try Again</Text>
                        </TouchableOpacity>
                    )}
                    {phase === 'failed' && (
                        <TouchableOpacity
                            style={canResend ? styles.secondaryBtn : styles.primaryBtn}
                            onPress={restart}
                        >
                            <Text style={canResend ? styles.secondaryText : styles.primaryText}>Scan Again</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </View>
    );
}
