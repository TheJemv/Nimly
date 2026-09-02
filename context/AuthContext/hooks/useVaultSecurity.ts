import { supabase } from '@/lib/supabase';
import {
    OWNER_ID_STORE,
    PRIVATE_KEY_STORE,
    purgeSharedSecrets,
    purgeVaultRAM,
    vaultIdentity,
    VaultIdentityState,
} from '@/utils/crypto';
import { Session } from '@supabase/supabase-js';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

// 'device_locked' → la cuenta ya está en uso en OTRO dispositivo. Nimly es de un
// solo dispositivo: este equipo no puede entrar hasta que el otro cierre sesión
// (o el usuario haga un "force takeover" con su contraseña).
export type VaultState = 'loading' | 'device_locked' | VaultIdentityState;

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
                setVaultState('ready');
                return 'ready';
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
            setVaultState('ready');
            return 'ready';
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
        setVaultState('ready');
    }, []);

    /**
     * "Perdí mi otro dispositivo": exige la contraseña de la cuenta, libera el
     * lock del servidor y toma el control aquí con una identidad nueva. Devuelve
     * un mensaje de error o `null` si salió bien.
     */
    const forceTakeover = useCallback(async (password: string): Promise<string | null> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) return 'Could not verify your account.';

        takeoverInFlightRef.current = true;
        try {
            const { error: authError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password,
            });
            if (authError) return 'Incorrect password.';

            await supabase.from('profiles').update({ current_device_id: null }).eq('id', user.id);
            await vaultIdentity.createFreshIdentity();
            await SecureStore.setItemAsync(OWNER_ID_STORE, user.id);
            await claimDevice(user.id);
            setVaultState('ready');
            return null;
        } catch (e) {
            console.error('forceTakeover failed:', e);
            return 'Could not set up this device. Check your connection and try again.';
        } finally {
            takeoverInFlightRef.current = false;
        }
    }, []);

    const purgeVaultData = async () => {
        if (__DEV__) console.log('Vault: signed out, purging local security keys');
        await releaseDevice();
        await SecureStore.deleteItemAsync('nymly_vault_seed');
        await SecureStore.deleteItemAsync(PRIVATE_KEY_STORE);
        await SecureStore.deleteItemAsync(OWNER_ID_STORE);
        purgeVaultRAM();
        purgeSharedSecrets();
        setVaultState('loading');
    };

    return {
        vaultState,
        setupVaultIdentity,
        confirmNewIdentity,
        forceTakeover,
        purgeVaultData,
    };
}
