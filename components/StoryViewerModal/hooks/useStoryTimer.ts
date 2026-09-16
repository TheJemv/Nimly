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
  /**
   * The video player blew up. Returning `true` = "I handled it" (e.g. I fell
   * back from HLS to MP4 and the player is about to be recreated) → do NOT
   * skip to the next story. `false`/undefined = skip as before.
   */
  onVideoError?: () => boolean;
}

export function useStoryTimer({
  isVideo,
  videoPlayer,
  onNext,
  isEnabled,
  isViewsSheetOpen,
  onMarkAsSeen,
  onVideoError,
}: UseStoryTimerProps) {
  const [isMediaLoading, setIsMediaLoading] = useState(true);
  const [isHolding, setIsHolding] = useState(false);

  // `onNext` isn't memoized upstream; using a ref avoids re-subscribing the
  // video listeners on every render.
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;
  const goNext = useCallback(() => onNextRef.current(), []);

  const onVideoErrorRef = useRef(onVideoError);
  onVideoErrorRef.current = onVideoError;

  const progressAnim = useAnimatedValue(0);
  const currentProgressVal = useRef(0);
  const isHoldingRef = useRef(false);
  const pressInTimeRef = useRef(0);
  const activeAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  // expo-video releases the native object on unmount / source change. Any
  // later call throws NotFoundException, so EVERY access is guarded.
  const safeVideo = useCallback((fn: (p: any) => void) => {
    if (!videoPlayer) return;
    try { fn(videoPlayer); } catch { /* player already released */ }
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

  // --- Progress bar for IMAGES (fixed duration) ---
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

  // --- Progress bar for VIDEO: follows the REAL playback time ---
  // If the video buffers, `currentTime` doesn't advance → the bar freezes on
  // its own, and we don't move to the next one until the video truly ends.
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
        // Loading / buffering: spinner and the bar does NOT advance.
        setIsMediaLoading(true);
      } else if (status === 'error') {
        // If the caller handles the error (HLS -> fallback to MP4), we don't skip:
        // the player gets recreated with the new source.
        const handled = onVideoErrorRef.current?.() ?? false;
        if (!handled && !isHoldingRef.current) goNext();
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
    // isEnabled / isViewsSheetOpen re-evaluate the effect; isHoldingRef is a ref.
  }, [isVideo, videoPlayer, isEnabled, isViewsSheetOpen, goNext, progressAnim, readVideo, safeVideo]);

  const handleMediaReady = useCallback(() => {
    onMarkAsSeen?.();
    if (isViewsSheetOpen || !isEnabled) return;

    // For video, the status effect handles spinner + play + bar.
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
