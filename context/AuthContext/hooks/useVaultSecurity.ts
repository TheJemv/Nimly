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
import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';

export type VaultState = 'loading' | VaultIdentityState;

export function useVaultSecurity() {
    // Estado de la identidad E2EE en ESTE dispositivo.
    const [vaultState, setVaultState] = useState<VaultState>('loading');

    // Evita que checkSession y onAuthStateChange corran el setup a la vez.
    const setupInFlight = useRef<Promise<void> | null>(null);

    const handleRemoteLogout = async () => {
        Alert.alert(
            "Sesión expirada",
            "Se ha iniciado sesión en otro dispositivo. Por seguridad, la bóveda se reiniciará."
        );
        await supabase.auth.signOut();
    };

    const setupSecuritySync = async (userId: string) => {
        try {
            const myDeviceId = `${Device.deviceName}-${Device.modelId}-${Device.osInternalBuildId}`;
            await supabase.from('profiles').update({ current_device_id: myDeviceId }).eq('id', userId);

            const channelName = `security_check_${userId}`;
            await supabase.removeChannel(supabase.channel(channelName));

            const securityChannel = supabase
                .channel(channelName)
                .on('postgres_changes',
                    { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
                    (payload) => {
                        const latestDeviceId = payload.new.current_device_id;
                        if (latestDeviceId && latestDeviceId !== myDeviceId) handleRemoteLogout();
                    }
                )
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED' && __DEV__) console.log("Vault Security: monitoring concurrent sessions");
                });

            return securityChannel;
        } catch (e) {
            console.error("Security sync failed silently:", e);
            return null;
        }
    };

    const runSetup = useCallback(async (userSession: Session | null) => {
        if (!userSession?.user) return;
        const currentUserId = userSession.user.id;

        try {
            const storedOwnerId = await SecureStore.getItemAsync(OWNER_ID_STORE);
            let localPrivateKey = await SecureStore.getItemAsync(PRIVATE_KEY_STORE);

            // Cambio de cuenta: las llaves del usuario anterior no sirven aquí.
            if (storedOwnerId && storedOwnerId !== currentUserId) {
                if (__DEV__) console.log("Vault: account switch detected, removing foreign keys");
                await SecureStore.deleteItemAsync(PRIVATE_KEY_STORE);
                localPrivateKey = null;
            }

            // Camino feliz: ya hay identidad local para este usuario.
            if (localPrivateKey && storedOwnerId === currentUserId) {
                await SecureStore.setItemAsync(OWNER_ID_STORE, currentUserId);
                setVaultState('ready');
                return;
            }

            // No hay llave local. ¿El servidor ya tiene una identidad?
            const state = await vaultIdentity.getIdentityState();

            if (state === 'needs_new_identity') {
                // NUNCA regenerar en silencio: el usuario debe confirmar que
                // acepta perder el historial cifrado anterior.
                setVaultState('needs_new_identity');
                return;
            }

            // Primera vez de verdad: crear identidad.
            await vaultIdentity.generateIdentity();
            await SecureStore.setItemAsync(OWNER_ID_STORE, currentUserId);
            setVaultState('ready');
        } catch (error) {
            console.error("Vault Initialization Error:", error);
            // Ante la duda, no asumimos 'ready'.
            setVaultState('needs_new_identity');
        }
    }, []);

    const setupVaultIdentity = useCallback((userSession: Session | null) => {
        if (!userSession?.user) return Promise.resolve();
        if (setupInFlight.current) return setupInFlight.current;
        const p = runSetup(userSession).finally(() => { setupInFlight.current = null; });
        setupInFlight.current = p;
        return p;
    }, [runSetup]);

    // El usuario confirma en un dispositivo sin llaves: nueva identidad,
    // el historial cifrado anterior queda ilegible.
    const confirmNewIdentity = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        await vaultIdentity.createFreshIdentity();
        if (user) await SecureStore.setItemAsync(OWNER_ID_STORE, user.id);
        setVaultState('ready');
    }, []);

    const purgeVaultData = async () => {
        if (__DEV__) console.log("Vault: signed out, purging local security keys");
        await SecureStore.deleteItemAsync('nymly_vault_seed');
        await SecureStore.deleteItemAsync(PRIVATE_KEY_STORE);
        await SecureStore.deleteItemAsync(OWNER_ID_STORE);
        purgeVaultRAM();
        purgeSharedSecrets();
        setVaultState('loading');
    };

    return {
        vaultState,
        setupSecuritySync,
        setupVaultIdentity,
        confirmNewIdentity,
        purgeVaultData,
    };
}
