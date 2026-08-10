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
  onMarkAsSeen?: () => void; // 👈 1. Añadimos la función callback para marcar como visto
}

export function useStoryTimer({
  isVideo,
  videoPlayer,
  onNext,
  isEnabled,
  isViewsSheetOpen,
  onMarkAsSeen, // 👈 2. Lo recibimos aquí
}: UseStoryTimerProps) {
  const [isMediaLoading, setIsMediaLoading] = useState(true);
  const [isHolding, setIsHolding] = useState(false);

  const progressAnim = useAnimatedValue(0);
  const currentProgressVal = useRef(0);
  const isHoldingRef = useRef(false);
  const pressInTimeRef = useRef(0);
  const activeAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  // Detener y reiniciar valores cuando cambia el medio
  const resetTimer = useCallback(() => {
    setIsMediaLoading(true);
    progressAnim.setValue(0);
    currentProgressVal.current = 0;
    isHoldingRef.current = false;
    setIsHolding(false);
    if (activeAnimationRef.current) {
      activeAnimationRef.current.stop();
    }
  }, [progressAnim]);

  // Iniciar la animación de la barra
  const startProgressAnimation = useCallback(
    (fromVal = 0, duration = DEFAULT_IMAGE_DURATION) => {
      progressAnim.setValue(fromVal);
      currentProgressVal.current = fromVal;

      if (activeAnimationRef.current) {
        activeAnimationRef.current.stop();
      }

      activeAnimationRef.current = Animated.timing(progressAnim, {
        toValue: 1,
        duration: duration,
        useNativeDriver: false,
      });

      activeAnimationRef.current.start(({ finished }) => {
        if (finished && !isHoldingRef.current && !isViewsSheetOpen) {
          onNext();
        }
      });
    },
    [isViewsSheetOpen, onNext, progressAnim]
  );

  // Callback ejecutado SOLO cuando la imagen o video terminó de cargar
  const handleMediaReady = useCallback(() => {
    setIsMediaLoading(false);

    // 👈 3. ¡PUM! Aquí marcamos como visto justo cuando el medio carga y está listo
    if (onMarkAsSeen) {
      onMarkAsSeen();
    }

    if (isViewsSheetOpen || !isEnabled) return;

    if (isVideo && videoPlayer) {
      videoPlayer.seekBy(-videoPlayer.currentTime);
      videoPlayer.play();
      const duration = (videoPlayer.duration || 5) * 1000;
      startProgressAnimation(0, duration);
    } else {
      startProgressAnimation(0, DEFAULT_IMAGE_DURATION);
    }
  }, [isEnabled, isVideo, isViewsSheetOpen, onMarkAsSeen, startProgressAnimation, videoPlayer]);

  // Manejar cuando se presiona la pantalla para pausar
  const handlePressIn = useCallback(() => {
    if (isMediaLoading || isViewsSheetOpen) return;

    pressInTimeRef.current = Date.now();
    isHoldingRef.current = true;
    setIsHolding(true);

    if (isVideo && videoPlayer) {
      videoPlayer.pause();
    }

    progressAnim.stopAnimation((val) => {
      currentProgressVal.current = val;
    });
  }, [isMediaLoading, isVideo, isViewsSheetOpen, progressAnim, videoPlayer]);

  // Manejar cuando se suelta la pantalla
  const handlePressOut = useCallback(() => {
    if (!isHoldingRef.current || isMediaLoading || isViewsSheetOpen) return;
    isHoldingRef.current = false;
    setIsHolding(false);

    if (isVideo && videoPlayer) {
      videoPlayer.play();
    }

    const remainingRatio = 1 - currentProgressVal.current;
    const duration = isVideo
      ? (videoPlayer?.duration || 5) * 1000
      : DEFAULT_IMAGE_DURATION;
    const remainingDuration = duration * remainingRatio;

    if (remainingDuration > 0) {
      startProgressAnimation(currentProgressVal.current, remainingDuration);
    } else {
      onNext();
    }
  }, [
    isMediaLoading,
    isVideo,
    isViewsSheetOpen,
    onNext,
    startProgressAnimation,
    videoPlayer,
  ]);

  const wasTapAction = useCallback(() => {
    const pressDuration = Date.now() - pressInTimeRef.current;
    return pressDuration < 250;
  }, []);

  const pauseTimerForSheet = useCallback(() => {
    if (isVideo && videoPlayer) videoPlayer.pause();
    progressAnim.stopAnimation((val) => {
      currentProgressVal.current = val;
    });
  }, [isVideo, progressAnim, videoPlayer]);

  const resumeTimerFromSheet = useCallback(() => {
    if (isVideo && videoPlayer) videoPlayer.play();
    const remainingRatio = 1 - currentProgressVal.current;
    const duration = isVideo
      ? (videoPlayer?.duration || 5) * 1000
      : DEFAULT_IMAGE_DURATION;
    startProgressAnimation(currentProgressVal.current, duration * remainingRatio);
  }, [isVideo, startProgressAnimation, videoPlayer]);

  useEffect(() => {
    return () => {
      progressAnim.stopAnimation();
    };
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