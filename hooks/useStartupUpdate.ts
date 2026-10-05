import * as Updates from "expo-updates";
import { useEffect, useState } from "react";
import { Image } from "react-native";

// How long the splash may wait on OTA work before the app opens anyway. The root
// layout's startup watchdog fires at 15s, so stay well under it.
const CHECK_TIMEOUT_MS = 4000;
const TOTAL_TIMEOUT_MS = 10000;

// Dev builds and Expo Go have no OTA: nothing to wait for.
const OTA_ENABLED = !__DEV__ && Updates.isEnabled;

// expo-updates draws a reload overlay while it restarts, white by default. Match
// the native splash (black, 200pt logo) so restarting into an update doesn't flash.
const SPLASH_LOGO_SIZE = 200;
const splashAsset = Image.resolveAssetSource(require("../assets/expo/splash.png"));
const RELOAD_SCREEN = {
    backgroundColor: "#000000",
    image: splashAsset
        ? { url: splashAsset.uri, width: SPLASH_LOGO_SIZE, height: SPLASH_LOGO_SIZE, scale: 1 }
        : undefined,
    imageResizeMode: "contain" as const,
    fade: true,
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout")), ms);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); },
        );
    });
}

/** Resolves `true` when the app is restarting into a freshly downloaded update. */
async function applyOtaUpdate(): Promise<boolean> {
    const startedAt = Date.now();
    try {
        const check = await withTimeout(Updates.checkForUpdateAsync(), CHECK_TIMEOUT_MS);
        if (!check.isAvailable) return false;

        const remaining = Math.max(TOTAL_TIMEOUT_MS - (Date.now() - startedAt), 0);
        const fetched = await withTimeout(Updates.fetchUpdateAsync(), remaining);
        if (!fetched.isNew) return false;

        await Updates.reloadAsync({ reloadScreenOptions: RELOAD_SCREEN });
        return true;
    } catch {
        // Offline, slow server, timeout...: open the app. The download (if any)
        // keeps going and expo-updates applies it on the next launch.
        return false;
    }
}

/**
 * Splash gate. While it returns `false` the splash stays up: it asks EAS Update
 * for a newer OTA update, downloads it if there is one and restarts into it.
 * Returns `true` once the app can open (no update, up to date, offline or timed out).
 */
export function useStartupUpdate(): boolean {
    const [settled, setSettled] = useState(!OTA_ENABLED);

    useEffect(() => {
        if (!OTA_ENABLED) return;
        let cancelled = false;
        applyOtaUpdate().then((restarting) => {
            // Restarting: never report "settled", so the app can't flash between
            // reloadAsync resolving and the restart actually happening.
            if (!restarting && !cancelled) setSettled(true);
        });
        return () => { cancelled = true; };
    }, []);

    return settled;
}
