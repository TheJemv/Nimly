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

  // Opens the right screen when tapping a notification (chat / notifications),
  // whether the app is already open or on a cold start.
  useNotificationRouting();

  useEffect(() => {
    // The token only makes sense with an active session.
    if (session) registerForPushNotificationsAsync();
  }, [session]);

  // React Native keeps timers frozen in the background: we need to
  // start/stop the Supabase token auto-refresh based on AppState, and
  // reconnect the realtime socket on return (iOS kills the connection).
  useEffect(() => {
    const sync = (state: string) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
        // If the socket died while we were away, reopen it. Subscribed
        // channels rejoin automatically on reconnect.
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