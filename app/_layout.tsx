// app/_layout.tsx
import * as Notifications from 'expo-notifications';
import 'react-native-get-random-values';

import { getThemeColor } from "@/constants/theme";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { supabase } from '@/lib/supabase'; // Importamos supabase para el chequeo de red
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from "react-native";

import ConnectionErrorView from "@/components/ConnectionErrorView"; // Importamos tu nueva pantalla
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

function RootLayoutNav() {
    const { isLoading } = useAuth(); // Extraemos 'user' para mayor control en la validación
    const router = useRouter();
    const bg = getThemeColor('background');
    const accent = getThemeColor('tint');

    // Estados de control de infraestructura de red
    const [isOffline, setIsOffline] = useState(false);
    const [isCheckingNetwork, setIsCheckingNetwork] = useState(false);

    // Hook para capturar la última notificación pulsada
    const lastNotificationResponse = Notifications.useLastNotificationResponse();

    // 1. FIREWALL DE RED: Verificar el estado del servidor de forma asíncrona al iniciar
    const checkServerConnection = async () => {
        setIsCheckingNetwork(true);
        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Timeout")), 3500)
            );
            const pingPromise = supabase.from('profiles').select('id').limit(1).maybeSingle();

            // Si el ping falla o tarda más de 3.5 segundos, se asume inestabilidad y salta al catch
            await Promise.race([pingPromise, timeoutPromise]);

            console.log("📡 [ROOT_AUTH] Cryptographic vault synced cleanly with server.");
            setIsOffline(false);
        } catch (e) {
            console.log("⚠️ [ROOT_AUTH] Bad network environment detected. Activating firewall view.");
            setIsOffline(true);
        } finally {
            setIsCheckingNetwork(false);
        }
    };

    useEffect(() => {
        checkServerConnection();
    }, []);

    // 2. Control del ruteo de notificaciones
    useEffect(() => {
        if (
            !isLoading &&
            !isOffline &&
            lastNotificationResponse &&
            lastNotificationResponse.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
        ) {
            const data = lastNotificationResponse.notification.request.content.data;
            if (data?.table === 'messages' && data?.senderId) {
                router.push({
                    pathname: `/(app)/(tabs)/(messages)`
                });
            }
            else if (data?.table === 'notifications') {
                router.push('/(app)/(tabs)/(home)/notifications');
            }
        }
    }, [lastNotificationResponse, isLoading, isOffline]);

    // PRIORIDAD 1: Si el Auth Context o el ping inicial están procesando, mostrar la carga limpia
    if (isLoading || isCheckingNetwork) {
        return (
            <View style={{ flex: 1, backgroundColor: bg, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={accent} />
            </View>
        );
    }

    // PRIORIDAD 2: Si el servidor está inalcanzable, renderizar fijamente la pantalla de error e interrumpir navegación
    if (isOffline) {
        return (
            <ConnectionErrorView
                onRetrySuccess={() => {
                    setIsOffline(false);
                    // Opcional: Aquí puedes volver a llamar a un método de recarga de sesión de tu AuthProvider si es necesario
                }}
            />
        );
    }

    // PRIORIDAD 3: Red segura garantizada, renderizar el árbol de navegación normal
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <BottomSheetModalProvider>
                <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="(auth)" />
                    <Stack.Screen name="(app)" />
                </Stack>
            </BottomSheetModalProvider>
        </GestureHandlerRootView>
    );
}

export default function AppLayout() {
    return (
        <AuthProvider>
            <ThemeProvider value={DarkTheme}>
                <RootLayoutNav />
            </ThemeProvider>
        </AuthProvider>
    );
}