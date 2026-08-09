// app/_layout.tsx
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-get-random-values';

import { AppMetrics, ObserveRoot } from "expo-observe";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";

import ConnectionErrorView from "@/components/ConnectionErrorView"; // Importamos tu nueva pantalla
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { supabase } from '@/lib/supabase'; // Importamos supabase para el chequeo de red

import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({
    duration: 1000,
    fade: true,
})

function RootLayoutNav() {
    const { isLoading } = useAuth();
    const [isOffline, setIsOffline] = useState(false);
    const [isCheckingNetwork, setIsCheckingNetwork] = useState(true); // 👈 empieza true

    const checkServerConnection = async () => {
        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Timeout")), 3500)
            );
            const pingPromise = supabase.from('profiles').select('id').limit(1).maybeSingle();
            await Promise.race([pingPromise, timeoutPromise]);
            setIsOffline(false);
        } catch (e) {
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
        checkServerConnection();
    }, []);

    // 👇 Un solo punto de verdad para ocultar el splash
    useEffect(() => {
        if (!isLoading && !isCheckingNetwork) {
            SplashScreen.hide();
            AppMetrics.markInteractive();
        }
    }, [isLoading, isCheckingNetwork]);

    if (isLoading || isCheckingNetwork) {
        return null; // el splash sigue visible, no montamos el ActivityIndicator todavía
    }

    if (isOffline) {
        return <ConnectionErrorView onRetrySuccess={() => setIsOffline(false)} />;
    }

    // PRIORIDAD 3: Red segura garantizada, renderizar el árbol de navegación normal
    return (
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000' }}>
            <BottomSheetModalProvider>
                <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="(auth)" />
                    <Stack.Screen name="(app)" />
                </Stack>
            </BottomSheetModalProvider>
        </GestureHandlerRootView>
    );
}

function AppLayout() {
    return (
        <AuthProvider>
            <RootLayoutNav />
        </AuthProvider>
    );
}

export default ObserveRoot.wrap(AppLayout)