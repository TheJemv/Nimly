// lib/supabase.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** true if the app was built without the Supabase environment variables. */
export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
    const message =
        'Supabase is not configured: EXPO_PUBLIC_SUPABASE_URL and/or ' +
        'EXPO_PUBLIC_SUPABASE_ANON_KEY are missing. Add them to your .env (or your EAS profile) and rebuild.';
    // In development we fail hard so we don't chase confusing network errors.
    if (__DEV__) throw new Error(`❌ ${message}`);
    // In production we don't crash the startup: the root layout's connection
    // check will detect the failure and show the error screen.
    console.error(`❌ ${message}`);
}

export const supabaseUrl = url ?? '';

export const supabase = createClient(supabaseUrl, anonKey ?? '', {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});
