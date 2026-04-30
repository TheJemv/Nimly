import { getThemeColor } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { registerForPushNotificationsAsync } from '@/hooks/notifications';
import * as Notifications from "expo-notifications";
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import 'react-native-reanimated';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const { session } = useAuth();

  useEffect(() => {
    registerForPushNotificationsAsync();

    // Escuchar cuando llega una notificación con la app abierta
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notificación recibida en vivo:', notification);
    });

    if (session) return () => subscription.remove();
  }, [session]);

  return (
    <Stack screenOptions={{
      headerShadowVisible: false,
      headerShown: false,
      headerTintColor: getThemeColor("text"),
      headerBackButtonDisplayMode: 'minimal',
      headerStyle: {
        backgroundColor: getThemeColor("background"),
      },
      headerTitleStyle: {
        color: getThemeColor("text"),
      },
    }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="new-post"
        options={{
          headerTitle: "New Post"
        }}
      />
      <Stack.Screen name="chat"
        options={{
          headerShown: true,
          headerTitle: "Chat",
        }}
      />
    </Stack>
  );
}
