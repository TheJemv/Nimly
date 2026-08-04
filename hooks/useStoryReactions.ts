// hooks/useStoryReactions.ts
import { storiesApi } from "@/api/stories";
import { ViewerProfile } from "@/types/stories";
import { useCallback, useRef, useState } from "react";
import { Animated, Dimensions } from "react-native";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

interface UseStoryReactionsProps {
  storyId: string;
  initialLikedState: boolean;
  onStoryLiked: (newState: boolean) => void;
  viewers: ViewerProfile[];
  pauseTimer: () => void;
  resumeTimer: () => void;
}

export function useStoryReactions({
  storyId,
  initialLikedState,
  onStoryLiked,
  viewers,
  pauseTimer,
  resumeTimer,
}: UseStoryReactionsProps) {
  const [isLiked, setIsLiked] = useState(initialLikedState);
  const [isViewsSheetOpen, setIsViewsSheetOpen] = useState(false);
  const sheetAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  // Actualizar estado local si cambia la historia
  useCallback(() => {
    setIsLiked(initialLikedState);
    setIsViewsSheetOpen(false);
    sheetAnim.setValue(SCREEN_HEIGHT);
  }, [initialLikedState, sheetAnim]);

  // Lógica de Toggle Like (Optimistic UI)
  const toggleLike = useCallback(async () => {
    if (!storyId) return;

    const nextState = !isLiked;
    setIsLiked(nextState);
    onStoryLiked(nextState); // Notificar al feed padre

    try {
      await storiesApi.toggleLike(storyId, "❤️");
    } catch (err) {
      console.warn("Error enviando reacción:", err);
      // Revertir en caso de error
      setIsLiked(!nextState);
      onStoryLiked(!nextState);
    }
  }, [isLiked, onStoryLiked, storyId]);

  // Ordenar espectadores (Likes primero)
  const sortedViewers = useCallback(() => {
    if (!viewers) return [];
    return [...viewers].sort((a, b) => {
      if (a.has_liked && !b.has_liked) return -1;
      if (!a.has_liked && b.has_liked) return 1;
      return 0;
    });
  }, [viewers]);

  // Lógica del Bottom Sheet
  const openViewsSheet = useCallback(() => {
    setIsViewsSheetOpen(true);
    pauseTimer(); // Pausar el progreso de la historia

    Animated.spring(sheetAnim, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 90,
    }).start();
  }, [pauseTimer, sheetAnim]);

  const closeViewsSheet = useCallback(() => {
    Animated.timing(sheetAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setIsViewsSheetOpen(false);
      resumeTimer(); // Reanudar el progreso
    });
  }, [resumeTimer, sheetAnim]);

  return {
    isLiked,
    toggleLike,
    isViewsSheetOpen,
    openViewsSheet,
    closeViewsSheet,
    sheetAnim,
    sortedViewers: sortedViewers(),
  };
}