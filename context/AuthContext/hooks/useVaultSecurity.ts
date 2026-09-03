import { supabase } from '@/lib/supabase';
import {
    identityRotation,
    OWNER_ID_STORE,
    PRIVATE_KEY_STORE,
    purgeSharedSecrets,
    purgeVaultRAM,
    vaultIdentity,
    VaultIdentityState,
} from '@/utils/crypto';
import { vaultPasscode } from '@/utils/vaultPasscode';
import { Session } from '@supabase/supabase-js';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

// 'device_locked'   → la cuenta ya está activa en OTRO dispositivo.
// 'needs_passcode'  → hay identidad usable aquí pero falta crear el PIN de 6
//                     dígitos (recuperación / segundo factor para el takeover).
export type VaultState = 'loading' | 'device_locked' | 'needs_passcode' | VaultIdentityState;

export type PasscodeResult = { ok: true } | { ok: false; message: string };

/** Identificador estable de este dispositivo (sobrevive reinstalación en el mismo equipo). */
const buildDeviceId = () =>
    `${Device.deviceName}-${Device.modelId}-${Device.osInternalBuildId}`;

export function useVaultSecurity() {
    const [vaultState, setVaultState] = useState<VaultState>('loading');

    // Evita que checkSession y onAuthStateChange corran el setup a la vez.
    const setupInFlight = useRef<Promise<VaultState> | null>(null);
    // Canal de realtime que vigila que nadie más reclame la cuenta.
    const securityChannelRef = useRef<any>(null);
    // userId cuyo "device lock" tenemos tomado (para soltarlo al cerrar sesión).
    const ownedUserIdRef = useRef<string | null>(null);
    // Evita que un runSetup disparado por el SIGNED_IN del re-login pise el
    // "force takeover" en curso.
    const takeoverInFlightRef = useRef(false);

    const handleRemoteTakeover = async () => {
        Alert.alert(
            'Signed out',
            'Your account is now active on another device. Nimly can only be used on one device at a time.'
        );
        await supabase.auth.signOut();
    };

    const watchForTakeover = (userId: string, myDeviceId: string) => {
        const channelName = `security_check_${userId}`;
        supabase.removeChannel(supabase.channel(channelName));

        return supabase
            .channel(channelName)
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
                (payload) => {
                    const latest = payload.new.current_device_id;
                    if (latest && latest !== myDeviceId) handleRemoteTakeover();
                }
            )
            .subscribe();
    };

    /** Marca este dispositivo como el activo de la cuenta y vigila cambios. */
    const claimDevice = async (userId: string) => {
        const myDeviceId = buildDeviceId();
        try {
            await supabase.from('profiles').update({ current_device_id: myDeviceId }).eq('id', userId);
            ownedUserIdRef.current = userId;

            if (securityChannelRef.current) {
                await supabase.removeChannel(securityChannelRef.current);
            }
            securityChannelRef.current = watchForTakeover(userId, myDeviceId);
        } catch (e) {
            console.error('claimDevice failed:', e);
        }
    };

    /** Suelta el lock del servidor SOLO si aún es nuestro (no pisamos a otro equipo). */
    const releaseDevice = async () => {
        const userId = ownedUserIdRef.current;
        ownedUserIdRef.current = null;
        if (securityChannelRef.current) {
            await supabase.removeChannel(securityChannelRef.current);
            securityChannelRef.current = null;
        }
        if (!userId) return;
        try {
            await supabase
                .from('profiles')
                .update({ current_device_id: null })
                .eq('id', userId)
                .eq('current_device_id', buildDeviceId());
        } catch (e) {
            console.error('releaseDevice failed:', e);
        }
    };

    useEffect(() => {
        return () => {
            if (securityChannelRef.current) supabase.removeChannel(securityChannelRef.current);
        };
    }, []);

    /** Bóveda usable aquí → 'ready', salvo que falte crear el passcode. */
    const finishReady = async (): Promise<VaultState> => {
        let hasPasscode = true; // ante un fallo de red no bloqueamos al usuario
        try { hasPasscode = await vaultPasscode.isSet(); } catch { /* resiliente */ }
        const next: VaultState = hasPasscode ? 'ready' : 'needs_passcode';
        setVaultState(next);
        return next;
    };

    const runSetup = useCallback(async (userSession: Session | null): Promise<VaultState> => {
        if (!userSession?.user) return 'loading';
        if (takeoverInFlightRef.current) return 'loading';
        const currentUserId = userSession.user.id;
        const myDeviceId = buildDeviceId();

        try {
            const storedOwnerId = await SecureStore.getItemAsync(OWNER_ID_STORE);
            let localPrivateKey = await SecureStore.getItemAsync(PRIVATE_KEY_STORE);

            // Cambio de cuenta: las llaves del usuario anterior no sirven aquí.
            if (storedOwnerId && storedOwnerId !== currentUserId) {
                await SecureStore.deleteItemAsync(PRIVATE_KEY_STORE);
                await identityRotation.clear();
                localPrivateKey = null;
            }

            // ¿Qué dispositivo tiene la cuenta según el servidor?
            const { data: profile } = await supabase
                .from('profiles')
                .select('current_device_id, public_key')
                .eq('id', currentUserId)
                .maybeSingle();

            const lockedTo = profile?.current_device_id ?? null;
            const heldByAnotherDevice = !!lockedTo && lockedTo !== myDeviceId;

            // BLOQUEO DURO: otro dispositivo tiene la cuenta.
            if (heldByAnotherDevice) {
                setVaultState('device_locked');
                return 'device_locked';
            }

            // Tenemos la identidad local y nadie más reclama la cuenta → listo.
            if (localPrivateKey && storedOwnerId === currentUserId) {
                await SecureStore.setItemAsync(OWNER_ID_STORE, currentUserId);
                await claimDevice(currentUserId);
                return finishReady();
            }

            // Sin llave local y libre. ¿El servidor ya tenía una identidad?
            if (profile?.public_key) {
                // Migración legítima (el otro dispositivo cerró sesión / se perdió):
                // requiere confirmación explícita porque se pierde el historial.
                setVaultState('needs_new_identity');
                return 'needs_new_identity';
            }

            // Primera identidad de la cuenta.
            await vaultIdentity.generateIdentity();
            await SecureStore.setItemAsync(OWNER_ID_STORE, currentUserId);
            await claimDevice(currentUserId);
            return finishReady();
        } catch (error) {
            console.error('Vault Initialization Error:', error);
            setVaultState('needs_new_identity');
            return 'needs_new_identity';
        }
    }, []);

    const setupVaultIdentity = useCallback((userSession: Session | null): Promise<VaultState> => {
        if (!userSession?.user) return Promise.resolve<VaultState>('loading');
        if (setupInFlight.current) return setupInFlight.current;
        const p = runSetup(userSession).finally(() => { setupInFlight.current = null; });
        setupInFlight.current = p;
        return p;
    }, [runSetup]);

    /**
     * Migración: dispositivo sin llaves y cuenta libre. Crea identidad nueva
     * (el historial cifrado anterior queda ilegible) y reclama el dispositivo.
     */
    const confirmNewIdentity = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        await vaultIdentity.createFreshIdentity();
        if (user) {
            await SecureStore.setItemAsync(OWNER_ID_STORE, user.id);
            await claimDevice(user.id);
        }
        await finishReady();
    }, []);

    /** Crea el PIN de 6 dígitos y desbloquea la app. */
    const createPasscode = useCallback(async (code: string): Promise<PasscodeResult> => {
        if (!/^\d{6}$/.test(code)) return { ok: false, message: 'Enter 6 digits.' };
        try {
            await vaultPasscode.set(code);
            setVaultState('ready');
            return { ok: true };
        } catch (e) {
            console.error('createPasscode failed:', e);
            return { ok: false, message: 'Could not save your passcode. Check your connection.' };
        }
    }, []);

    // Núcleo compartido: libera el lock del servidor y toma el control aquí con
    // una identidad NUEVA (el historial cifrado anterior queda ilegible).
    const doTakeover = async (userId: string): Promise<PasscodeResult> => {
        takeoverInFlightRef.current = true;
        try {
            await supabase.from('profiles').update({ current_device_id: null }).eq('id', userId);
            await vaultIdentity.createFreshIdentity();
            await SecureStore.setItemAsync(OWNER_ID_STORE, userId);
            await claimDevice(userId);
            await finishReady();
            return { ok: true };
        } catch (e) {
            console.error('doTakeover failed:', e);
            return { ok: false, message: 'Could not set up this device. Check your connection and try again.' };
        } finally {
            takeoverInFlightRef.current = false;
        }
    };

    /** Takeover con el PIN de 6 dígitos (camino principal). */
    const takeoverWithPasscode = useCallback(async (code: string): Promise<PasscodeResult> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { ok: false, message: 'Could not verify your account.' };

        const res = await vaultPasscode.verify(code);
        if (!res.ok) {
            if (res.reason === 'no_passcode') return { ok: false, message: 'No passcode set. Use your account password instead.' };
            if (res.reason === 'locked') return { ok: false, message: 'Too many attempts. Try again in 15 minutes.' };
            if (res.reason === 'wrong') return { ok: false, message: `Wrong passcode. ${res.attemptsLeft} attempt(s) left.` };
            return { ok: false, message: 'Could not check your passcode. Check your connection.' };
        }
        return doTakeover(user.id);
    }, []);

    /** Fallback: takeover con la contraseña de la cuenta ("olvidé mi passcode"). */
    const forceTakeover = useCallback(async (password: string): Promise<PasscodeResult> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) return { ok: false, message: 'Could not verify your account.' };

        const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password });
        if (authError) return { ok: false, message: 'Incorrect password.' };

        return doTakeover(user.id);
    }, []);

    const purgeVaultData = async () => {
        if (__DEV__) console.log('Vault: signed out, purging local security keys');
        await releaseDevice();
        await SecureStore.deleteItemAsync('nymly_vault_seed');
        await SecureStore.deleteItemAsync(PRIVATE_KEY_STORE);
        await SecureStore.deleteItemAsync(OWNER_ID_STORE);
        await identityRotation.clear();
        await vaultPasscode.clearLocalFlag();
        purgeVaultRAM();
        purgeSharedSecrets();
        setVaultState('loading');
    };

    return {
        vaultState,
        setupVaultIdentity,
        confirmNewIdentity,
        createPasscode,
        takeoverWithPasscode,
        forceTakeover,
        purgeVaultData,
    };
}
