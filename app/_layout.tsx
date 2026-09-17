// app/_layout.tsx
import { useCallback, useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-get-random-values';

import { AppMetrics, ObserveRoot } from "expo-observe";
import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";

import { AppErrorBoundary, AppRecoveryView } from "@/components/AppErrorBoundary";
import ConnectionErrorView from "@/components/ConnectionErrorView";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { supabaseUrl } from '@/lib/supabase';

import { AppReadyProvider, useAppReady } from '@/context/AppReadyContext';
import { BlockedUsersProvider } from '@/context/BlockedUsersContext';
import { ProfileProvider } from '@/context/ProfileContext';
import { useAppForeground } from '@/hooks/useAppForeground';
import { useIncomingMessageCache } from '@/hooks/useIncomingMessageCache';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { StatusBar, StyleSheet, View } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { scrubBreadcrumb, scrubSentryEvent } from '@/utils/sentryScrub';

Sentry.init({
  dsn: 'https://aa8f8ea6c977c413e09cc4ee443efb1a@o4512021080440832.ingest.us.sentry.io/4512021085028352',

  // E2EE app: we don't send IP / cookies / personal data by default.
  sendDefaultPii: false,

  environment: __DEV__ ? 'development' : 'production',

  // Errors only → minimal quota. No performance tracing.
  tracesSampleRate: 0,

  // Known noise that adds no value.
  ignoreErrors: [
    'Network request failed',
    'AbortError',
    'Non-Error promise rejection captured',
  ],

  // E2EE: redacts keys / decrypted text / passcodes from everything that goes out.
  beforeSend: scrubSentryEvent,
  beforeBreadcrumb: scrubBreadcrumb,
});

SplashScreen.preventAutoHideAsync().catch(() => { });
SplashScreen.setOptions({
    duration: 1000,
    fade: true,
})

// Failsafe: if startup never finishes (hung promise, bad OTA bundle, …) don't
// trap the user on the splash forever — show a recovery screen after this long.
// Sits comfortably past the legit worst case (10s auth timeout + 3.5s net check).
const STARTUP_WATCHDOG_MS = 15000;

// Failsafe of its own for the overlay that covers the Home's first load: if
// markHomeReady() never arrives (e.g. the posts fetch hangs with no network,
// with no timeout of its own like auth has) we don't want the user stuck
// behind a fake splash forever -- at 8s we release it anyway, and the normal
// feed spinner (the previous behavior) remains as a visible fallback.
const HOME_OVERLAY_WATCHDOG_MS = 8000;

// How often we check that the server is still up AFTER startup.
const HEALTH_POLL_MS = 20000;

/**
 * Is the server responding? Hits the REST endpoint directly (with the apikey)
 * instead of `profiles` — this way we distinguish "server down" (Cloudflare
 * returns a 5xx with HTML) from "the server responded but with a
 * permissions/RLS error". Anything that isn't an OK response = down.
 */
async function isServerReachable(): Promise<boolean> {
    try {
        const timeout = new Promise<Response>((_, reject) =>
            setTimeout(() => reject(new Error('health-timeout')), 4000),
        );
        const res = await Promise.race([
            fetch(`${supabaseUrl}/rest/v1/`, {
                headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '' },
            }),
            timeout,
        ]);
        return res.ok;
    } catch {
        return false;
    }
}

function RootLayoutNav() {
    const { isLoading, session, vault } = useAuth();
    const { homeReady } = useAppReady();
    useIncomingMessageCache(session?.user?.id ?? null);
    const [isOffline, setIsOffline] = useState(false);
    const [isCheckingNetwork, setIsCheckingNetwork] = useState(true);
    const [startupStalled, setStartupStalled] = useState(false);
    const [homeOverlayStalled, setHomeOverlayStalled] = useState(false);

    const ready = !isLoading && !isCheckingNetwork;

    // Only worth waiting for the feed to load before revealing the app if
    // we're going to land on Home (session + vault ready, not locked).
    // Note: we do NOT include vault.state in `ready` -- runSetup has paths
    // that leave the state at 'loading' (no session, hung query) and that
    // would block the entire startup.
    const willShowHome = !!session && vault.state === 'ready';
    const showHomeOverlay = ready && willShowHome && !homeReady && !homeOverlayStalled;

    useEffect(() => {
        if (!ready || !willShowHome || homeReady) return;
        const t = setTimeout(() => setHomeOverlayStalled(true), HOME_OVERLAY_WATCHDOG_MS);
        return () => clearTimeout(t);
    }, [ready, willShowHome, homeReady]);

    useEffect(() => {
        if (ready) return;
        const t = setTimeout(() => setStartupStalled(true), STARTUP_WATCHDOG_MS);
        return () => clearTimeout(t);
    }, [ready]);

    useEffect(() => {
        if (startupStalled && !ready) SplashScreen.hide();
    }, [startupStalled, ready]);

    const checkServerConnection = async () => {
        setIsOffline(!(await isServerReachable()));
        setIsCheckingNetwork(false);
    };

    useEffect(() => {
        if (!isLoading) {
            checkServerConnection();
        }
    }, [isLoading]);

    // The check above only runs on startup. If the server goes down WHILE
    // the app is open, without this the app would look "business as usual"
    // but with everything empty/dark (every fetch fails silently). We check
    // every 20s and when returning from the background; if it comes back,
    // it recovers on its own.
    const revalidateConnection = useCallback(async () => {
        setIsOffline(!(await isServerReachable()));
    }, []);

    useEffect(() => {
        if (!ready) return;
        const id = setInterval(revalidateConnection, HEALTH_POLL_MS);
        return () => clearInterval(id);
    }, [ready, revalidateConnection]);

    useAppForeground(() => { if (ready) revalidateConnection(); });

    useEffect(() => {
        if (ready) {
            SplashScreen.hide();
            try { AppMetrics.markInteractive(); } catch { /* telemetry only */ }
        }
    }, [ready]);

    if (!ready) {
        return startupStalled ? <AppRecoveryView reason="timeout" /> : null;
    }

    if (isOffline) {
        return <ConnectionErrorView onRetrySuccess={() => setIsOffline(false)} />;
    }

    return (
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000' }}>
            <BottomSheetModalProvider>
                <Stack
                    screenOptions={{
                        headerShown: false,
                        // 👈 Make sure to also set the black background here
                        contentStyle: { backgroundColor: '#000000' },
                        headerStyle: { backgroundColor: '#000000' },
                        headerTintColor: '#fff',
                    }}
                >
                    <Stack.Screen name="(auth)" />
                    <Stack.Screen name="(app)" />
                </Stack>

                {/*
                    Home is already mounted behind this (loading posts and
                    stories) -- we cover it with something identical to the
                    native splash until markHomeReady() signals it's done, so
                    the splash never "goes away" too early and exposes the
                    feed's spinners.
                */}
                {showHomeOverlay && <HomeLoadingOverlay />}
            </BottomSheetModalProvider>
        </GestureHandlerRootView>
    );
}

/** Mirrors the native splash (same background + logo) to cover Home's initial load. */
function HomeLoadingOverlay() {
    return (
        <View style={styles.overlayFill}>
            <Image
                source={require('../assets/expo/splash.png')}
                style={styles.overlayImage}
                contentFit="contain"
            />
        </View>
    );
}

function AppLayout() {
    return (
        <AppErrorBoundary>
            <StatusBar backgroundColor="#000000" barStyle="light-content" />
            <ThemeProvider value={DarkTheme}>
                <AuthProvider>
                    <AppReadyProvider>
                        <ProfileProvider>
                            <BlockedUsersProvider>
                                <RootLayoutNav />
                            </BlockedUsersProvider>
                        </ProfileProvider>
                    </AppReadyProvider>
                </AuthProvider>
            </ThemeProvider>
        </AppErrorBoundary>
    );
}

const styles = StyleSheet.create({
    overlayFill: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: '#000000',
        alignItems: 'center',
        justifyContent: 'center',
    },
    overlayImage: {
        width: 200,
        height: 200,
    },
});

export default Sentry.wrap(ObserveRoot.wrap(AppLayout));