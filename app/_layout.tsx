// app/_layout.tsx
import * as Notifications from 'expo-notifications'; // 3. Importar Notifications
import 'react-native-get-random-values';

import { getThemeColor } from "@/constants/theme";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter } from "expo-router"; // 2. Importar useRouter
import { useEffect } from 'react'; // 1. Importar useEffect
import { ActivityIndicator, View } from "react-native";

import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

function RootLayoutNav() {
    const { isLoading, user } = useAuth(); // Asumo que tienes 'user' para saber si está logueado
    const router = useRouter();
    const bg = getThemeColor('background');
    const accent = getThemeColor('tint');

    // 4. Hook para capturar la última notificación pulsada
    const lastNotificationResponse = Notifications.useLastNotificationResponse();

    useEffect(() => {
        if (
            !isLoading &&
            lastNotificationResponse &&
            lastNotificationResponse.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
        ) {
            const data = lastNotificationResponse.notification.request.content.data;

            // Si es un mensaje, usamos el senderId que ahora mandamos desde la nube
            if (data?.table === 'messages' && data?.senderId) {
                router.push({
                    pathname: `/(app)/chat`, params: {
                        id: data.senderId as any
                    }
                });
            }
            // Si es una notificación general
            else if (data?.table === 'notifications') {
                router.push('/(app)/(tabs)/(home)/notifications');
            }
        }
    }, [lastNotificationResponse, isLoading]);

    if (isLoading) {
        return (
            <View style={{ flex: 1, backgroundColor: bg, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={accent} />
            </View>
        );
    }

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