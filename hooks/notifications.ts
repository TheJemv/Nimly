// hooks/notifications.ts
import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Without a handler, expo-notifications does NOT show the notification when the
// app is in the foreground: the user would receive the message "silently" and
// it looked like notifications weren't working. This makes the banner show
// just like it does in the background.
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

// The token THIS device wrote to the profile, so sign-out can remove exactly
// that one (and never the token of a device that took over the account).
const PUSH_TOKEN_STORE = 'nimly_push_token';

/**
 * Requests notification permission, registers the Expo push token, and saves
 * it in the user's profile. Must only be called when there's an active session.
 */
export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
    // Default channel on Android (required for notifications to show).
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
        const { error } = await supabase
            .from('profiles')
            .update({ expo_push_token: token })
            .eq('id', user.id);
        if (!error) {
            try { await AsyncStorage.setItem(PUSH_TOKEN_STORE, token); } catch { /* not critical */ }
        }
    }

    return token;
}

/**
 * Removes this device's push token from the profile so it stops receiving the
 * account's pushes. Must run BEFORE signing out: without a session, RLS rejects
 * the update. Only clears it if the profile still points at THIS device.
 */
export async function unregisterPushTokenAsync(userId: string): Promise<void> {
    try {
        const token = await AsyncStorage.getItem(PUSH_TOKEN_STORE);
        if (!token) return;

        const { error } = await supabase
            .from('profiles')
            .update({ expo_push_token: null })
            .eq('id', userId)
            .eq('expo_push_token', token);
        if (!error) await AsyncStorage.removeItem(PUSH_TOKEN_STORE);
    } catch (e) {
        console.error('unregisterPushToken failed:', e);
    }
}
