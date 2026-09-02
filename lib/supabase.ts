// lib/supabase.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** true si la app se compiló sin las variables de entorno de Supabase. */
export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
    const message =
        'Supabase no está configurado: faltan EXPO_PUBLIC_SUPABASE_URL y/o ' +
        'EXPO_PUBLIC_SUPABASE_ANON_KEY. Añádelas a tu .env (o al perfil de EAS) y reconstruye.';
    // En desarrollo fallamos fuerte para no perseguir errores de red confusos.
    if (__DEV__) throw new Error(`❌ ${message}`);
    // En producción no reventamos el arranque: el chequeo de conexión del layout
    // raíz detectará el fallo y mostrará la pantalla de error.
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
