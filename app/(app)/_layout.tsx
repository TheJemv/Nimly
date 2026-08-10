// app/_layout.tsx
import { getThemeColor } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { registerForPushNotificationsAsync } from '@/hooks/notifications';
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import 'react-native-reanimated';

export const unstable_settings = {
  anchor: '(tabs)',
};


export default function RootLayout() {
  const { session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    registerForPushNotificationsAsync();
    //  Feauture: Notification inner app like instagram.
    // const foregroundSubscription = Notifications.addNotificationReceivedListener(notification => {
    //   console.log('Notificación recibida en vivo:', notification);
    // });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as {
        type?: string;
        friendId?: string;
        user?: any;
      };

      if (data?.type === "message") {
        router.push("/(app)/(tabs)/(messages)")
      }
    });

    if (session) {
      return () => {
        // foregroundSubscription.remove();
        responseSubscription.remove();
      };
    }
  }, [session, router]);

  return (
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
    </Stack>
  );
}