import { useEffect, useRef } from "react";
import { AppState } from "react-native";

/**
 * Runs `onForeground` when the app comes back from a real background
 * (not a quick Control Center / notification-center peek). Used to re-open
 * realtime channels and re-fetch anything missed while the JS thread was
 * suspended.
 */
export function useAppForeground(onForeground: () => void) {
   const cb = useRef(onForeground);
   cb.current = onForeground;

   useEffect(() => {
      let wasBackground = AppState.currentState === "background";

      const sub = AppState.addEventListener("change", (next) => {
         if (next === "background") {
            wasBackground = true;
         } else if (next === "active" && wasBackground) {
            wasBackground = false;
            cb.current();
         }
      });

      return () => sub.remove();
   }, []);
}
