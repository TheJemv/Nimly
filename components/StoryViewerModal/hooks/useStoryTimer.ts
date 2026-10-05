import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";

import { useAnimatedValue } from "@/utils/animations";

const DEFAULT_IMAGE_DURATION = 5000;
/** Shorter than this is a tap (navigate); longer is a hold (pause, hide the UI). */
const TAP_MAX_MS = 250;

/**
 * Everything that can pause a story. The story only runs while NONE is active,
 * so one thing ending (e.g. the keyboard closing) can't resume a story that
 * something else (e.g. the finger still down) is holding.
 */
export type StoryPauseReason = "hold" | "drag" | "reply" | "menu" | "sheet" | "delete" | "closing";

interface UseStoryTimerProps {
  /** Id of the story on screen: the timer starts over whenever it changes. */
  storyKey: string | undefined;
  isVideo: boolean;
  videoPlayer: any;
  /** Called with the id of the story that finished. */
  onNext: (fromStoryKey?: string) => void;
  isEnabled: boolean;
  onMarkAsSeen?: () => void;
  /**
   * The video player blew up. Returning `true` = "I handled it" (e.g. I fell
   * back from HLS to MP4 and the player is about to be recreated) → keep
   * waiting. `false`/undefined = the story is shown as failed.
   */
  onVideoError?: () => boolean;
}

export function useStoryTimer({
  storyKey,
  isVideo,
  videoPlayer,
  onNext,
  isEnabled,
  onMarkAsSeen,
  onVideoError,
}: UseStoryTimerProps) {
  const [isMediaLoading, setIsMediaLoading] = useState(true);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [isHolding, setIsHolding] = useState(false);

  // Callbacks change every render upstream; refs keep the listeners stable.
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;
  const storyKeyRef = useRef(storyKey);
  storyKeyRef.current = storyKey;
  const onVideoErrorRef = useRef(onVideoError);
  onVideoErrorRef.current = onVideoError;
  const onMarkAsSeenRef = useRef(onMarkAsSeen);
  onMarkAsSeenRef.current = onMarkAsSeen;
  const playerRef = useRef(videoPlayer);
  playerRef.current = videoPlayer;
  const enabledRef = useRef(isEnabled);
  enabledRef.current = isEnabled;

  const progressAnim = useAnimatedValue(0);
  const progressValRef = useRef(0);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const pausesRef = useRef<Set<StoryPauseReason>>(new Set());
  /** The media is on screen (loaded, or failed and showing the error). */
  const readyRef = useRef(false);
  /** Fixed-duration bar (images and failed media) vs following the video's time. */
  const timedRef = useRef(!isVideo);
  const mountedRef = useRef(true);
  const pressInAtRef = useRef(0);
  const holdUiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // expo-video releases the native object on unmount / source change. Any
  // later call throws NotFoundException, so EVERY access is guarded.
  const safeVideo = useCallback((fn: (p: any) => void) => {
    const player = playerRef.current;
    if (!player) return;
    try { fn(player); } catch { /* player already released */ }
  }, []);

  const readVideo = useCallback(<T,>(fn: (p: any) => T, fallback: T): T => {
    const player = playerRef.current;
    if (!player) return fallback;
    try { return fn(player); } catch { return fallback; }
  }, []);

  const canRun = useCallback(
    () => mountedRef.current && enabledRef.current && readyRef.current && pausesRef.current.size === 0,
    [],
  );

  // Linear, from wherever the bar is: resuming mid-story keeps the same speed.
  const startTimedProgress = useCallback(() => {
    animRef.current?.stop();
    const from = progressValRef.current;
    const remaining = (1 - from) * DEFAULT_IMAGE_DURATION;
    if (remaining <= 0) {
      onNextRef.current(storyKeyRef.current);
      return;
    }
    const anim = Animated.timing(progressAnim, {
      toValue: 1,
      duration: remaining,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    animRef.current = anim;
    anim.start(({ finished }) => {
      if (animRef.current === anim) animRef.current = null;
      // Any pause stops the animation (finished = false), so reaching the end
      // means it really ran its full time.
      if (finished && mountedRef.current) {
        progressValRef.current = 1;
        onNextRef.current(storyKeyRef.current);
      }
    });
  }, [progressAnim]);

  const run = useCallback(() => {
    if (!canRun()) return;
    if (timedRef.current) startTimedProgress();
    else safeVideo((p) => p.play());
  }, [canRun, safeVideo, startTimedProgress]);

  const halt = useCallback(() => {
    if (timedRef.current) {
      animRef.current?.stop();
      animRef.current = null;
      progressAnim.stopAnimation((val) => { progressValRef.current = val; });
    } else {
      safeVideo((p) => p.pause());
    }
  }, [progressAnim, safeVideo]);

  const pause = useCallback((reason: StoryPauseReason) => {
    const wasRunning = pausesRef.current.size === 0;
    pausesRef.current.add(reason);
    if (wasRunning) halt();
  }, [halt]);

  const resume = useCallback((reason: StoryPauseReason) => {
    if (!pausesRef.current.delete(reason)) return;
    run();
  }, [run]);

  // New story: start from zero. Layout effect = before paint and before the
  // video listeners below subscribe, so the new bar never flashes the old
  // progress and a fast `readyToPlay` isn't wiped by a late reset.
  useLayoutEffect(() => {
    animRef.current?.stop();
    animRef.current = null;
    progressAnim.setValue(0);
    progressValRef.current = 0;
    readyRef.current = false;
    timedRef.current = !isVideo;
    // A tap that navigated has already lifted the finger.
    pausesRef.current.delete("hold");
    if (holdUiTimeoutRef.current) clearTimeout(holdUiTimeoutRef.current);
    setIsHolding(false);
    setIsMediaLoading(true);
    setMediaFailed(false);
  }, [storyKey]);

  /** The media couldn't load: show the error and move on after the normal time. */
  const handleMediaFailed = useCallback(() => {
    if (timedRef.current && readyRef.current) return;
    if (!timedRef.current) safeVideo((p) => p.pause());
    timedRef.current = true;
    readyRef.current = true;
    setIsMediaLoading(false);
    setMediaFailed(true);
    run();
  }, [run, safeVideo]);

  // --- VIDEO: the bar follows the REAL playback time ---
  // If the video buffers, `currentTime` doesn't advance → the bar freezes on
  // its own, and we don't move to the next one until the video truly ends.
  useEffect(() => {
    if (!isVideo || !videoPlayer) return;

    let cancelled = false;
    try { videoPlayer.timeUpdateEventInterval = 0.2; } catch { /* noop */ }
    // A late event from the previous story's player (e.g. its playToEnd right
    // as you tap) must not move the new story.
    const isStale = () => cancelled || playerRef.current !== videoPlayer;

    const syncStatus = () => {
      if (isStale() || timedRef.current) return;
      const status = readVideo((p) => p.status, "idle");
      if (status === "readyToPlay") {
        readyRef.current = true;
        setIsMediaLoading(false);
        // Only plays if nothing is pausing the story (reply open, finger down...).
        run();
      } else if (status === "loading" || status === "idle") {
        // Loading / buffering: spinner and the bar does NOT advance.
        setIsMediaLoading(true);
      } else if (status === "error") {
        // If the caller handles it (HLS -> MP4 fallback) the player gets
        // recreated with the new source: keep waiting.
        const handled = onVideoErrorRef.current?.() ?? false;
        if (!handled) handleMediaFailed();
      }
    };
    syncStatus();

    const subs = [
      videoPlayer.addListener?.("statusChange", () => syncStatus()),
      videoPlayer.addListener?.("timeUpdate", ({ currentTime }: { currentTime: number }) => {
        if (isStale() || timedRef.current) return;
        const dur = readVideo((p) => p.duration, 0);
        if (!dur || dur <= 0) return;
        const p = Math.min(Math.max(currentTime / dur, 0), 1);
        progressValRef.current = p;
        progressAnim.setValue(p);
      }),
      videoPlayer.addListener?.("playToEnd", () => {
        if (isStale() || timedRef.current || !mountedRef.current) return;
        progressValRef.current = 1;
        progressAnim.setValue(1);
        onNextRef.current(storyKeyRef.current);
      }),
    ].filter(Boolean);

    return () => {
      cancelled = true;
      subs.forEach((s: any) => { try { s?.remove?.(); } catch { /* released */ } });
    };
  }, [isVideo, videoPlayer, handleMediaFailed, progressAnim, readVideo, run]);

  useEffect(() => {
    if (isEnabled) {
      pausesRef.current.delete("closing"); // reopened
      run();
    } else {
      halt();
    }
  }, [isEnabled]);

  /** Image loaded / first video frame painted. */
  const handleMediaReady = useCallback(() => {
    onMarkAsSeenRef.current?.();
    // For video, the status listener handles spinner + play + bar.
    if (!timedRef.current || readyRef.current) return;
    readyRef.current = true;
    setIsMediaLoading(false);
    run();
  }, [run]);

  // Taps work even while the story is loading: that's when you most want to skip it.
  const handlePressIn = useCallback(() => {
    pressInAtRef.current = Date.now();
    pause("hold");
    // Hide the UI only for a real hold, not on every tap (it used to flicker).
    if (holdUiTimeoutRef.current) clearTimeout(holdUiTimeoutRef.current);
    holdUiTimeoutRef.current = setTimeout(() => setIsHolding(true), TAP_MAX_MS);
  }, [pause]);

  const handlePressOut = useCallback(() => {
    if (holdUiTimeoutRef.current) clearTimeout(holdUiTimeoutRef.current);
    setIsHolding(false);
    resume("hold");
  }, [resume]);

  const wasTapAction = useCallback(() => Date.now() - pressInAtRef.current < TAP_MAX_MS, []);

  /** Back on the very first story: play it again from the start. */
  const restartStory = useCallback(() => {
    animRef.current?.stop();
    animRef.current = null;
    progressAnim.setValue(0);
    progressValRef.current = 0;
    if (!timedRef.current) safeVideo((p) => { p.currentTime = 0; });
    run();
  }, [progressAnim, run, safeVideo]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      animRef.current?.stop();
      progressAnim.stopAnimation();
      if (holdUiTimeoutRef.current) clearTimeout(holdUiTimeoutRef.current);
    };
  }, [progressAnim]);

  return {
    progressAnim,
    isMediaLoading,
    mediaFailed,
    isHolding,
    handleMediaReady,
    handleMediaFailed,
    handlePressIn,
    handlePressOut,
    wasTapAction,
    restartStory,
    pause,
    resume,
  };
}
