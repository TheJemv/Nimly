// api/notifications.ts
import { supabase } from '@/lib/supabase';
import * as Notifications from 'expo-notifications';

export async function registerForPushNotificationsAsync() {
    let token;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return;
    }

    token = (await Notifications.getExpoPushTokenAsync({
        projectId: "a641f4fb-5891-4c81-9427-c57bb896c1b7", // Debe ser algo como '868a1234-...'
    })).data;

    // Guardar el token en tu base de datos de Ubuntu
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        await supabase
            .from('profiles')
            .update({ expo_push_token: token })
            .eq('id', user.id);
    }

    return token;
}