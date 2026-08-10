import { useState } from "react";
import { Animated, Dimensions, useAnimatedValue } from "react-native";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export function useViewsSheet() {
    const [isViewsSheetOpen, setIsViewsSheetOpen] = useState(false);
    const sheetAnim = useAnimatedValue(SCREEN_HEIGHT);

    const openViewsSheet = (onOpen?: () => void) => {
        setIsViewsSheetOpen(true);
        onOpen?.();

        Animated.spring(sheetAnim, {
            toValue: 0,
            useNativeDriver: true,
            damping: 20,
            stiffness: 90,
        }).start();
    };

    const closeViewsSheet = (onClosed?: () => void) => {
        Animated.timing(sheetAnim, {
            toValue: SCREEN_HEIGHT,
            duration: 250,
            useNativeDriver: true,
        }).start(() => {
            setIsViewsSheetOpen(false);
            onClosed?.();
        });
    };

    const resetSheet = () => {
        setIsViewsSheetOpen(false);
        sheetAnim.setValue(SCREEN_HEIGHT);
    };

    return { isViewsSheetOpen, sheetAnim, openViewsSheet, closeViewsSheet, resetSheet };
}