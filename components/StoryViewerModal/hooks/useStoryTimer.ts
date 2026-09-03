import { useCallback, useEffect, useRef, useState } from "react";
import { Animated } from "react-native";

import { useAnimatedValue } from "@/utils/animations";

const DEFAULT_IMAGE_DURATION = 5000;

interface UseStoryTimerProps {
  isVideo: boolean;
  videoPlayer: any;
  onNext: () => void;
  isEnabled: boolean;
  isViewsSheetOpen: boolean;
  onMarkAsSeen?: () => void;
}

export function useStoryTimer({
  isVideo,
  videoPlayer,
  onNext,
  isEnabled,
  isViewsSheetOpen,
  onMarkAsSeen,
}: UseStoryTimerProps) {
  const [isMediaLoading, setIsMediaLoading] = useState(true);
  const [isHolding, setIsHolding] = useState(false);

  // `onNext` no está memoizado aguas arriba; con un ref evitamos re-suscribir los
  // listeners del video en cada render.
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;
  const goNext = useCallback(() => onNextRef.current(), []);

  const progressAnim = useAnimatedValue(0);
  const currentProgressVal = useRef(0);
  const isHoldingRef = useRef(false);
  const pressInTimeRef = useRef(0);
  const activeAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  // expo-video libera el objeto nativo al desmontar / cambiar de fuente. Cualquier
  // llamada posterior lanza NotFoundException, así que TODO acceso va protegido.
  const safeVideo = useCallback((fn: (p: any) => void) => {
    if (!videoPlayer) return;
    try { fn(videoPlayer); } catch { /* player ya liberado */ }
  }, [videoPlayer]);

  const readVideo = useCallback(<T,>(fn: (p: any) => T, fallback: T): T => {
    if (!videoPlayer) return fallback;
    try { return fn(videoPlayer); } catch { return fallback; }
  }, [videoPlayer]);

  const resetTimer = useCallback(() => {
    setIsMediaLoading(true);
    progressAnim.setValue(0);
    currentProgressVal.current = 0;
    isHoldingRef.current = false;
    setIsHolding(false);
    if (activeAnimationRef.current) activeAnimationRef.current.stop();
  }, [progressAnim]);

  // --- Barra de progreso para IMÁGENES (duración fija) ---
  const startImageProgress = useCallback((fromVal = 0, duration = DEFAULT_IMAGE_DURATION) => {
    progressAnim.setValue(fromVal);
    currentProgressVal.current = fromVal;
    if (activeAnimationRef.current) activeAnimationRef.current.stop();

    activeAnimationRef.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration,
      useNativeDriver: false,
    });
    activeAnimationRef.current.start(({ finished }) => {
      if (finished && !isHoldingRef.current && !isViewsSheetOpen) goNext();
    });
  }, [goNext, isViewsSheetOpen, progressAnim]);

  // --- Barra de progreso para VIDEO: sigue el tiempo REAL de reproducción ---
  // Si el video buffea, `currentTime` no avanza → la barra se congela sola, y no
  // pasamos al siguiente hasta que el video termina de verdad.
  useEffect(() => {
    if (!isVideo || !videoPlayer || !isEnabled) return;

    let cancelled = false;
    try { videoPlayer.timeUpdateEventInterval = 0.2; } catch { /* noop */ }

    const syncStatus = () => {
      const status = readVideo((p) => p.status, 'idle');
      if (status === 'readyToPlay') {
        setIsMediaLoading(false);
        if (!isHoldingRef.current && !isViewsSheetOpen) safeVideo((p) => p.play());
      } else if (status === 'loading' || status === 'idle') {
        // Cargando / buffering: spinner y la barra NO avanza.
        setIsMediaLoading(true);
      } else if (status === 'error') {
        if (!isHoldingRef.current) goNext();
      }
    };
    syncStatus();

    const subs = [
      videoPlayer.addListener?.('statusChange', () => { if (!cancelled) syncStatus(); }),
      videoPlayer.addListener?.('sourceChange', () => {
        if (cancelled) return;
        currentProgressVal.current = 0;
        progressAnim.setValue(0);
        setIsMediaLoading(true);
      }),
      videoPlayer.addListener?.('timeUpdate', ({ currentTime }: { currentTime: number }) => {
        if (cancelled || isHoldingRef.current) return;
        const dur = readVideo((p) => p.duration, 0);
        if (!dur || dur <= 0) return;
        const p = Math.min(Math.max(currentTime / dur, 0), 1);
        currentProgressVal.current = p;
        progressAnim.setValue(p);
      }),
      videoPlayer.addListener?.('playToEnd', () => {
        if (cancelled || isHoldingRef.current || isViewsSheetOpen) return;
        currentProgressVal.current = 1;
        progressAnim.setValue(1);
        goNext();
      }),
    ].filter(Boolean);

    return () => {
      cancelled = true;
      subs.forEach((s: any) => s?.remove?.());
    };
    // isEnabled / isViewsSheetOpen re-evalúan el efecto; isHoldingRef es ref.
  }, [isVideo, videoPlayer, isEnabled, isViewsSheetOpen, goNext, progressAnim, readVideo, safeVideo]);

  const handleMediaReady = useCallback(() => {
    onMarkAsSeen?.();
    if (isViewsSheetOpen || !isEnabled) return;

    // Para video, el efecto de estado maneja spinner + play + barra.
    if (isVideo) return;

    setIsMediaLoading(false);
    startImageProgress(0, DEFAULT_IMAGE_DURATION);
  }, [isEnabled, isVideo, isViewsSheetOpen, onMarkAsSeen, startImageProgress]);

  const handlePressIn = useCallback(() => {
    if (isMediaLoading || isViewsSheetOpen) return;
    pressInTimeRef.current = Date.now();
    isHoldingRef.current = true;
    setIsHolding(true);

    if (isVideo) {
      safeVideo((p) => p.pause());
    } else {
      progressAnim.stopAnimation((val) => { currentProgressVal.current = val; });
    }
  }, [isMediaLoading, isVideo, isViewsSheetOpen, progressAnim, safeVideo]);

  const handlePressOut = useCallback(() => {
    if (!isHoldingRef.current || isMediaLoading || isViewsSheetOpen) return;
    isHoldingRef.current = false;
    setIsHolding(false);

    if (isVideo) {
      safeVideo((p) => p.play());
      return;
    }

    const remaining = (1 - currentProgressVal.current) * DEFAULT_IMAGE_DURATION;
    if (remaining > 0) startImageProgress(currentProgressVal.current, remaining);
    else goNext();
  }, [goNext, isMediaLoading, isVideo, isViewsSheetOpen, safeVideo, startImageProgress]);

  const wasTapAction = useCallback(() => Date.now() - pressInTimeRef.current < 250, []);

  const pauseTimerForSheet = useCallback(() => {
    if (isVideo) safeVideo((p) => p.pause());
    progressAnim.stopAnimation((val) => { currentProgressVal.current = val; });
  }, [isVideo, progressAnim, safeVideo]);

  const resumeTimerFromSheet = useCallback(() => {
    if (isVideo) {
      safeVideo((p) => p.play());
      return;
    }
    const remaining = (1 - currentProgressVal.current) * DEFAULT_IMAGE_DURATION;
    startImageProgress(currentProgressVal.current, remaining > 0 ? remaining : DEFAULT_IMAGE_DURATION);
  }, [isVideo, safeVideo, startImageProgress]);

  useEffect(() => {
    return () => { progressAnim.stopAnimation(); };
  }, [progressAnim]);

  return {
    progressAnim,
    isMediaLoading,
    isHolding,
    resetTimer,
    handleMediaReady,
    handlePressIn,
    handlePressOut,
    wasTapAction,
    pauseTimerForSheet,
    resumeTimerFromSheet,
  };
}
