// app/_layout.tsx
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-get-random-values';

import { AppMetrics, ObserveRoot } from "expo-observe";
import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";

import ConnectionErrorView from "@/components/ConnectionErrorView";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { supabase } from '@/lib/supabase';

import { BlockedUsersProvider } from '@/context/BlockedUsersContext';
import { ProfileProvider } from '@/context/ProfileContext';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { StatusBar } from 'react-native';

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({
    duration: 1000,
    fade: true,
})

function RootLayoutNav() {
    const { isLoading } = useAuth();
    const [isOffline, setIsOffline] = useState(false);
    const [isCheckingNetwork, setIsCheckingNetwork] = useState(true);

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
        if (!isLoading && !isCheckingNetwork) {
            SplashScreen.hide();
            AppMetrics.markInteractive();
        }
    }, [isLoading, isCheckingNetwork]);

    if (isLoading || isCheckingNetwork) {
        return null;
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
        <>
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
        </>
    );
}


export default ObserveRoot.wrap(AppLayout)