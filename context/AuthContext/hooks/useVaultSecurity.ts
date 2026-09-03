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
import { useAppForeground } from '@/hooks/useAppForeground';
import { vaultPasscode } from '@/utils/vaultPasscode';
import * as Sentry from '@sentry/react-native';
import { Session } from '@supabase/supabase-js';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

// 'device_locked'   → la cuenta ya está activa en OTRO dispositivo.
// 'needs_passcode'  → hay identidad usable aquí pero falta el PIN de 6 dígitos
//                     en ESTE dispositivo (primer login / takeover con password).
// 'locked_timeout'  → hay PIN, pero pasaron >12h desde el último desbloqueo.
export type VaultState = 'loading' | 'device_locked' | 'needs_passcode' | 'locked_timeout' | VaultIdentityState;

export type PasscodeResult = { ok: true } | { ok: false; message: string };

/** Cada cuánto la app vuelve a pedir el passcode. */
const AUTO_LOCK_MS = 12 * 60 * 60 * 1000;

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

    /**
     * Bóveda usable aquí → 'ready', salvo que:
     *  - falte el PIN local en este dispositivo → 'needs_passcode'
     *  - hayan pasado >12h desde el último desbloqueo → 'locked_timeout'
     * Todo local: no necesita red.
     */
    const finishReady = async (): Promise<VaultState> => {
        let next: VaultState = 'ready';
        try {
            if (!(await vaultPasscode.hasLocal())) {
                next = 'needs_passcode';
            } else {
                const last = await vaultPasscode.lastUnlockAt();
                if (!last || Date.now() - last > AUTO_LOCK_MS) next = 'locked_timeout';
            }
        } catch { /* ante la duda, dejamos pasar */ }
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
            Sentry.captureException(error, { tags: { area: 'vault-init' } });
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

    /** Crea el PIN de 6 dígitos (servidor + local) y desbloquea la app. */
    const createPasscode = useCallback(async (code: string): Promise<PasscodeResult> => {
        if (!/^\d{6}$/.test(code)) return { ok: false, message: 'Enter 6 digits.' };
        try {
            await vaultPasscode.setRemote(code);
            await vaultPasscode.saveLocal(code);
            await vaultPasscode.touchUnlock();
            setVaultState('ready');
            return { ok: true };
        } catch (e) {
            console.error('createPasscode failed:', e);
            return { ok: false, message: 'Could not save your passcode. Check your connection.' };
        }
    }, []);

    /** Desbloqueo periódico (12h): se valida contra el hash LOCAL, sin red. */
    const unlockWithPasscode = useCallback(async (code: string): Promise<PasscodeResult> => {
        if (!/^\d{6}$/.test(code)) return { ok: false, message: 'Enter 6 digits.' };
        const ok = await vaultPasscode.verifyLocal(code);
        if (!ok) return { ok: false, message: 'Wrong passcode.' };
        await vaultPasscode.touchUnlock();
        setVaultState('ready');
        return { ok: true };
    }, []);

    // Núcleo compartido: libera el lock del servidor y toma el control aquí con
    // una identidad NUEVA (el historial cifrado anterior queda ilegible).
    // Si viene `localPasscode`, lo guarda para el auto-lock antes de resolver.
    const doTakeover = async (userId: string, localPasscode?: string): Promise<PasscodeResult> => {
        takeoverInFlightRef.current = true;
        try {
            await supabase.from('profiles').update({ current_device_id: null }).eq('id', userId);
            await vaultIdentity.createFreshIdentity();
            await SecureStore.setItemAsync(OWNER_ID_STORE, userId);
            await claimDevice(userId);
            if (localPasscode) {
                await vaultPasscode.saveLocal(localPasscode);
                await vaultPasscode.touchUnlock();
            }
            await finishReady();
            return { ok: true };
        } catch (e) {
            console.error('doTakeover failed:', e);
            Sentry.captureException(e, { tags: { area: 'vault-takeover' } });
            return { ok: false, message: 'Could not set up this device. Check your connection and try again.' };
        } finally {
            takeoverInFlightRef.current = false;
        }
    };

    /** Takeover con el PIN de 6 dígitos (camino principal). */
    const takeoverWithPasscode = useCallback(async (code: string): Promise<PasscodeResult> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { ok: false, message: 'Could not verify your account.' };

        const res = await vaultPasscode.verifyRemote(code);
        if (!res.ok) {
            if (res.reason === 'no_passcode') return { ok: false, message: 'No passcode set. Use your account password instead.' };
            if (res.reason === 'locked') return { ok: false, message: 'Too many attempts. Try again in 15 minutes.' };
            if (res.reason === 'wrong') return { ok: false, message: `Wrong passcode. ${res.attemptsLeft} attempt(s) left.` };
            return { ok: false, message: 'Could not check your passcode. Check your connection.' };
        }

        return doTakeover(user.id, code);
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
        await vaultPasscode.clearLocal();
        purgeVaultRAM();
        purgeSharedSecrets();
        setVaultState('loading');
    };

    // Auto-lock: al volver a primer plano, si la bóveda estaba lista y pasaron
    // >12h desde el último desbloqueo, exige el PIN otra vez.
    useAppForeground(() => {
        if (vaultState !== 'ready') return;
        (async () => {
            const last = await vaultPasscode.lastUnlockAt();
            if (!last || Date.now() - last > AUTO_LOCK_MS) {
                if (await vaultPasscode.hasLocal()) setVaultState('locked_timeout');
            }
        })();
    });

    return {
        vaultState,
        setupVaultIdentity,
        confirmNewIdentity,
        createPasscode,
        unlockWithPasscode,
        takeoverWithPasscode,
        forceTakeover,
        purgeVaultData,
    };
}
