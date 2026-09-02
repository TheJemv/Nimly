// hooks/notifications.ts
import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

/**
 * Pide permiso de notificaciones, registra el Expo push token y lo guarda en el
 * perfil del usuario. Debe llamarse solo cuando hay sesión iniciada.
 */
export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
    // Canal por defecto en Android (obligatorio para que se muestren).
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.DEFAULT,
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
        }).catch(() => { });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        console.log('Push notifications permission not granted.');
        return;
    }

    if (!projectId) {
        console.warn('Missing EAS projectId; cannot fetch Expo push token.');
        return;
    }

    let token: string;
    try {
        token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch (e) {
        console.error('Failed to get Expo push token:', e);
        return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        await supabase
            .from('profiles')
            .update({ expo_push_token: token })
            .eq('id', user.id);
    }

    return token;
}
