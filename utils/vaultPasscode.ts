import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import crypto, { Buffer } from 'react-native-quick-crypto';

// Hash local del PIN (Keychain) → permite re-verificar el auto-lock SIN red.
// El hash del servidor (tabla vault_security) solo se usa para el takeover en
// otro dispositivo.
const LOCAL_HASH_STORE = 'nimly_passcode_local';       // "iters:saltHex:hashHex"
const LAST_UNLOCK_STORE = 'nimly_passcode_last_unlock'; // ms epoch (AsyncStorage)

const PBKDF2_ITERATIONS = 200_000;
const KEYLEN = 32;

const derive = (code: string, saltHex: string, iterations: number): string =>
    (crypto.pbkdf2Sync(code, Buffer.from(saltHex, 'hex'), iterations, KEYLEN, 'sha256') as Buffer).toString('hex');

const timingSafeEqualHex = (a: string, b: string): boolean => {
    try {
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
    } catch {
        return a === b;
    }
};

export type PasscodeVerifyResult =
    | { ok: true }
    | { ok: false; reason: 'no_passcode' }
    | { ok: false; reason: 'locked'; until: string }
    | { ok: false; reason: 'wrong'; attemptsLeft: number }
    | { ok: false; reason: 'error' };

export const vaultPasscode = {
    // ---- Servidor (takeover en otro dispositivo) ----

    /** Crea / cambia el PIN en el servidor. */
    async setRemote(code: string): Promise<void> {
        const { error } = await supabase.rpc('set_vault_passcode', { p_passcode: code });
        if (error) throw error;
    },

    /** Verifica contra el servidor con rate-limiting. */
    async verifyRemote(code: string): Promise<PasscodeVerifyResult> {
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

    // ---- Local (setup en este device + auto-lock) ----

    async saveLocal(code: string): Promise<void> {
        const saltHex = (crypto.randomBytes(16) as Buffer).toString('hex');
        const hashHex = derive(code, saltHex, PBKDF2_ITERATIONS);
        await SecureStore.setItemAsync(LOCAL_HASH_STORE, `${PBKDF2_ITERATIONS}:${saltHex}:${hashHex}`);
    },

    async hasLocal(): Promise<boolean> {
        try { return !!(await SecureStore.getItemAsync(LOCAL_HASH_STORE)); } catch { return false; }
    },

    async verifyLocal(code: string): Promise<boolean> {
        try {
            const stored = await SecureStore.getItemAsync(LOCAL_HASH_STORE);
            if (!stored) return false;
            const [iterStr, saltHex, hashHex] = stored.split(':');
            const iterations = parseInt(iterStr, 10) || PBKDF2_ITERATIONS;
            if (!saltHex || !hashHex) return false;
            return timingSafeEqualHex(derive(code, saltHex, iterations), hashHex);
        } catch {
            return false;
        }
    },

    async touchUnlock(): Promise<void> {
        try { await AsyncStorage.setItem(LAST_UNLOCK_STORE, String(Date.now())); } catch { /* ignore */ }
    },

    async lastUnlockAt(): Promise<number | null> {
        try {
            const v = await AsyncStorage.getItem(LAST_UNLOCK_STORE);
            const n = v ? parseInt(v, 10) : NaN;
            return Number.isFinite(n) ? n : null;
        } catch {
            return null;
        }
    },

    async clearLocal(): Promise<void> {
        try { await SecureStore.deleteItemAsync(LOCAL_HASH_STORE); } catch { /* ignore */ }
        try { await AsyncStorage.removeItem(LAST_UNLOCK_STORE); } catch { /* ignore */ }
    },
};
