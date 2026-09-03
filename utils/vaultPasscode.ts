import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Flag local para no consultar el servidor en cada arranque una vez que ya
// sabemos que la cuenta tiene passcode. Se limpia al cerrar sesión.
const PASSCODE_SET_FLAG = 'nimly_passcode_set';

export type PasscodeVerifyResult =
    | { ok: true }
    | { ok: false; reason: 'no_passcode' }
    | { ok: false; reason: 'locked'; until: string }
    | { ok: false; reason: 'wrong'; attemptsLeft: number }
    | { ok: false; reason: 'error' };

export const vaultPasscode = {
    /** ¿La cuenta ya tiene un passcode? (con caché local optimista). */
    async isSet(): Promise<boolean> {
        try {
            if ((await AsyncStorage.getItem(PASSCODE_SET_FLAG)) === '1') return true;
        } catch { /* ignore */ }

        const { data, error } = await supabase.rpc('has_vault_passcode');
        if (error) throw error;
        if (data) {
            try { await AsyncStorage.setItem(PASSCODE_SET_FLAG, '1'); } catch { /* ignore */ }
        }
        return !!data;
    },

    /** Crea / cambia el passcode (6 dígitos). */
    async set(code: string): Promise<void> {
        const { error } = await supabase.rpc('set_vault_passcode', { p_passcode: code });
        if (error) throw error;
        try { await AsyncStorage.setItem(PASSCODE_SET_FLAG, '1'); } catch { /* ignore */ }
    },

    async verify(code: string): Promise<PasscodeVerifyResult> {
        try {
            const { data, error } = await supabase.rpc('verify_vault_passcode', { p_passcode: code });
            if (error || !data) return { ok: false, reason: 'error' };
            if (data.ok) return { ok: true };
            if (data.reason === 'locked') return { ok: false, reason: 'locked', until: data.until };
            if (data.reason === 'no_passcode') return { ok: false, reason: 'no_passcode' };
            return { ok: false, reason: 'wrong', attemptsLeft: data.attempts_left ?? 0 };
        } catch {
            return { ok: false, reason: 'error' };
        }
    },

    async clearLocalFlag(): Promise<void> {
        try { await AsyncStorage.removeItem(PASSCODE_SET_FLAG); } catch { /* ignore */ }
    },
};
