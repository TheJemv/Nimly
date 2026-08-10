// utils/animations.ts
import { useRef } from "react";
import { Animated } from "react-native";

/**
 * Crea o recupera una instancia persistente de Animated.Value sin violar las reglas de useRef del linter.
 */
function useAnimatedValue(initialValue: number): Animated.Value {
    const animRef = useRef<Animated.Value | null>(null);
    if (!animRef.current) {
        animRef.current = new Animated.Value(initialValue);
    }
    return animRef.current;
}

export { useAnimatedValue };
