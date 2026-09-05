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

import { AppReadyProvider, useAppReady } from '@/context/AppReadyContext';
import { BlockedUsersProvider } from '@/context/BlockedUsersContext';
import { ProfileProvider } from '@/context/ProfileContext';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { StatusBar, StyleSheet, View } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { scrubBreadcrumb, scrubSentryEvent } from '@/utils/sentryScrub';

Sentry.init({
  dsn: 'https://aa8f8ea6c977c413e09cc4ee443efb1a@o4512021080440832.ingest.us.sentry.io/4512021085028352',

  // App E2EE: no mandamos IP / cookies / datos personales por defecto.
  sendDefaultPii: false,

  environment: __DEV__ ? 'development' : 'production',

  // Solo errores → mínima cuota. Sin performance tracing.
  tracesSampleRate: 0,

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

// Failsafe propio del overlay que tapa la primera carga del Home: si
// markHomeReady() nunca llega (p. ej. el fetch de posts se cuelga sin red,
// sin timeout propio como el de auth) no queremos al usuario atrapado detrás
// de un splash falso para siempre -- a los 8s lo soltamos igual, y el spinner
// normal del feed (el comportamiento de antes) queda como respaldo visible.
const HOME_OVERLAY_WATCHDOG_MS = 8000;

function RootLayoutNav() {
    const { isLoading, session, vault } = useAuth();
    const { homeReady } = useAppReady();
    const [isOffline, setIsOffline] = useState(false);
    const [isCheckingNetwork, setIsCheckingNetwork] = useState(true);
    const [startupStalled, setStartupStalled] = useState(false);
    const [homeOverlayStalled, setHomeOverlayStalled] = useState(false);

    // Antes "ready" no esperaba a la bóveda -- si vault seguía en 'loading'
    // cuando isLoading ya era false, se alcanzaba a ver un parpadeo antes de
    // que VaultKeyGate decidiera qué mostrar. Ahora también espera eso.
    const vaultResolved = vault.state !== 'loading';
    const ready = !isLoading && !isCheckingNetwork && vaultResolved;

    // Solo si vamos a terminar en el Home (sesión + bóveda lista, no bloqueada)
    // vale la pena esperar a que cargue su feed antes de destapar la app --
    // se evalúa una sola vez que vaultResolved es true, así no cambia de
    // opinión a medio camino.
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

                {/*
                    El Home ya está montado detrás de esto (cargando posts y
                    stories) -- lo tapamos con algo idéntico al splash nativo
                    hasta que markHomeReady() avise que terminó, para que el
                    splash nunca "se quite" antes de tiempo dejando ver los
                    spinners del feed.
                */}
                {showHomeOverlay && <HomeLoadingOverlay />}
            </BottomSheetModalProvider>
        </GestureHandlerRootView>
    );
}

/** Calca el splash nativo (mismo fondo + logo) para tapar la carga inicial del Home. */
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