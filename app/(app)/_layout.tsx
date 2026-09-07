// app/_layout.tsx
import VaultKeyGate from '@/components/VaultKeyGate';
import { getThemeColor } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { registerForPushNotificationsAsync } from '@/hooks/notifications';
import { useNotificationRouting } from '@/hooks/useNotificationRouting';
import { supabase } from '@/lib/supabase';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import 'react-native-reanimated';

export const unstable_settings = {
  anchor: '(tabs)',
};


export default function RootLayout() {
  const { session } = useAuth();

  // Abre la pantalla correcta al tocar una notificación (chat / notificaciones),
  // tanto con la app abierta como en arranque en frío.
  useNotificationRouting();

  useEffect(() => {
    // El token solo tiene sentido con sesión iniciada.
    if (session) registerForPushNotificationsAsync();
  }, [session]);

  // React Native mantiene los timers congelados en segundo plano: hay que
  // arrancar/parar el auto-refresh del token de Supabase con el AppState, y
  // reconectar el socket de realtime al volver (iOS mata la conexión).
  useEffect(() => {
    const sync = (state: string) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
        // Si el socket murió mientras estábamos fuera, lo reabrimos. Los
        // canales suscritos se vuelven a unir solos al reconectar.
        if (!supabase.realtime.isConnected()) {
          supabase.realtime.connect();
        }
      } else {
        supabase.auth.stopAutoRefresh();
      }
    };

    sync(AppState.currentState);
    const sub = AppState.addEventListener('change', sync);
    return () => sub.remove();
  }, []);

  return (
    <VaultKeyGate>
    <Stack screenOptions={{
      headerShadowVisible: false,
      headerTintColor: getThemeColor("text"),
      headerBackButtonDisplayMode: 'minimal',
      headerStyle: {
        backgroundColor: getThemeColor("background"),
      },
      headerTitleStyle: {
        color: getThemeColor("text"),
      },
      animation: 'slide_from_right',
      contentStyle: { backgroundColor: '#000' }
    }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="user/[id]" options={{ headerShown: true, headerTitle: "Profile" }} />
      <Stack.Screen name="new-post" options={{ headerTitle: "New Post" }} />
      <Stack.Screen name="chat"
        options={{
          headerShown: true,
          headerTitle: "Chat",
        }}
      />
      <Stack.Screen name="chat-info" options={{ headerShown: true, headerTitle: "Chat Info" }} />
    </Stack>
    </VaultKeyGate>
  );
}