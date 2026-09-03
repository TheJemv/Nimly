// app/_layout.tsx
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-get-random-values';

import { AppMetrics, ObserveRoot } from "expo-observe";
import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";

import { AppErrorBoundary, AppRecoveryView } from "@/components/AppErrorBoundary";
import ConnectionErrorView from "@/components/ConnectionErrorView";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { supabase } from '@/lib/supabase';

import { BlockedUsersProvider } from '@/context/BlockedUsersContext';
import { ProfileProvider } from '@/context/ProfileContext';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { StatusBar } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { scrubBreadcrumb, scrubSentryEvent } from '@/utils/sentryScrub';

Sentry.init({
  dsn: 'https://aa8f8ea6c977c413e09cc4ee443efb1a@o4512021080440832.ingest.us.sentry.io/4512021085028352',

  // App E2EE: no mandamos IP / cookies / datos personales por defecto.
  sendDefaultPii: false,

  environment: __DEV__ ? 'development' : 'production',

  // Solo errores → mínima cuota. Sin performance tracing ni logs.
  tracesSampleRate: 0,
  enableLogs: false,

  // Ruido conocido que no aporta.
  ignoreErrors: [
    'Network request failed',
    'AbortError',
    'Non-Error promise rejection captured',
  ],

  // E2EE: redacta llaves / texto descifrado / passcodes de todo lo que sale.
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

function RootLayoutNav() {
    const { isLoading } = useAuth();
    const [isOffline, setIsOffline] = useState(false);
    const [isCheckingNetwork, setIsCheckingNetwork] = useState(true);
    const [startupStalled, setStartupStalled] = useState(false);

    const ready = !isLoading && !isCheckingNetwork;

    useEffect(() => {
        if (ready) return;
        const t = setTimeout(() => setStartupStalled(true), STARTUP_WATCHDOG_MS);
        return () => clearTimeout(t);
    }, [ready]);

    useEffect(() => {
        if (startupStalled && !ready) SplashScreen.hide();
    }, [startupStalled, ready]);

    const checkServerConnection = async () => {
        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Timeout")), 3500)
            );
            const pingPromise = supabase.from('profiles').select('id').limit(1).maybeSingle();
            await Promise.race([pingPromise, timeoutPromise]);
            setIsOffline(false);
        } catch {
            setIsOffline(true);
        } finally {
            setIsCheckingNetwork(false);
        }
    };

    useEffect(() => {
        if (!isLoading) {
            checkServerConnection();
        }
    }, [isLoading]);

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
                        // 👈 Asegúrate de poner el fondo negro también aquí
                        contentStyle: { backgroundColor: '#000000' },
                        headerStyle: { backgroundColor: '#000000' },
                        headerTintColor: '#fff',
                    }}
                >
                    <Stack.Screen name="(auth)" />
                    <Stack.Screen name="(app)" />
                </Stack>
            </BottomSheetModalProvider>
        </GestureHandlerRootView>
    );
}

function AppLayout() {
    return (
        <AppErrorBoundary>
            <StatusBar backgroundColor="#000000" barStyle="light-content" />
            <ThemeProvider value={DarkTheme}>
                <AuthProvider>
                    <ProfileProvider>
                        <BlockedUsersProvider>
                            <RootLayoutNav />
                        </BlockedUsersProvider>
                    </ProfileProvider>
                </AuthProvider>
            </ThemeProvider>
        </AppErrorBoundary>
    );
}


export default Sentry.wrap(ObserveRoot.wrap(AppLayout));