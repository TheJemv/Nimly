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

export type VaultState = 'loading' | VaultIdentityState;

/** Identificador estable de este dispositivo (para detectar sesiones paralelas). */
const buildDeviceId = () =>
    `${Device.deviceName}-${Device.modelId}-${Device.osInternalBuildId}`;

export function useVaultSecurity() {
    // Estado de la identidad E2EE en ESTE dispositivo.
    const [vaultState, setVaultState] = useState<VaultState>('loading');
    // true si la cuenta ya tiene una identidad ANCLADA a otro dispositivo activo:
    // este equipo no podrá leer el historial y continuar bloquea al otro.
    const [otherDeviceActive, setOtherDeviceActive] = useState(false);

    // Evita que checkSession y onAuthStateChange corran el setup a la vez.
    const setupInFlight = useRef<Promise<VaultState> | null>(null);
    // Canal de realtime que vigila sesiones concurrentes. Solo se abre cuando la
    // bóveda está usable en ESTE dispositivo (así no expulsamos al otro equipo
    // hasta que el usuario confirma que toma el control aquí).
    const securityChannelRef = useRef<any>(null);

    const handleRemoteLogout = async () => {
        Alert.alert(
            "Sesión expirada",
            "Se ha iniciado sesión en otro dispositivo. Por seguridad, la bóveda se reiniciará."
        );
        await supabase.auth.signOut();
    };

    const setupSecuritySync = async (userId: string) => {
        try {
            const myDeviceId = buildDeviceId();
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

    /** Reclama este dispositivo como el activo y vigila cambios (expulsa a otros). */
    const claimDevice = async (userId: string) => {
        if (securityChannelRef.current) {
            await supabase.removeChannel(securityChannelRef.current);
            securityChannelRef.current = null;
        }
        securityChannelRef.current = await setupSecuritySync(userId);
    };

    // Limpieza al desmontar el provider (cierre de app).
    useEffect(() => {
        return () => {
            if (securityChannelRef.current) supabase.removeChannel(securityChannelRef.current);
        };
    }, []);

    const runSetup = useCallback(async (userSession: Session | null): Promise<VaultState> => {
        if (!userSession?.user) return 'loading';
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
                await claimDevice(currentUserId);
                setVaultState('ready');
                return 'ready';
            }

            // No hay llave local. ¿El servidor ya tiene una identidad?
            const state = await vaultIdentity.getIdentityState();

            if (state === 'needs_new_identity') {
                // ¿Hay OTRO dispositivo activo con las llaves de esta cuenta?
                // (inicio de sesión ajeno / cuenta compartida) → aviso reforzado.
                try {
                    const { data } = await supabase
                        .from('profiles')
                        .select('current_device_id')
                        .eq('id', currentUserId)
                        .single();
                    const other = data?.current_device_id;
                    setOtherDeviceActive(!!other && other !== buildDeviceId());
                } catch {
                    setOtherDeviceActive(false);
                }

                // NUNCA regenerar en silencio: el usuario debe confirmar que
                // acepta perder el historial cifrado anterior. Tampoco reclamamos
                // el dispositivo todavía (no expulsamos al otro equipo).
                setVaultState('needs_new_identity');
                return 'needs_new_identity';
            }

            // Primera vez de verdad: crear identidad.
            await vaultIdentity.generateIdentity();
            await SecureStore.setItemAsync(OWNER_ID_STORE, currentUserId);
            await claimDevice(currentUserId);
            setVaultState('ready');
            return 'ready';
        } catch (error) {
            console.error("Vault Initialization Error:", error);
            // Ante la duda, no asumimos 'ready'.
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

    // El usuario confirma en un dispositivo sin llaves: nueva identidad,
    // el historial cifrado anterior queda ilegible. Recién AQUÍ reclamamos el
    // dispositivo (lo que expulsa al otro equipo con las llaves viejas).
    const confirmNewIdentity = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        await vaultIdentity.createFreshIdentity();
        if (user) {
            await SecureStore.setItemAsync(OWNER_ID_STORE, user.id);
            await claimDevice(user.id);
        }
        setOtherDeviceActive(false);
        setVaultState('ready');
    }, []);

    const purgeVaultData = async () => {
        if (__DEV__) console.log("Vault: signed out, purging local security keys");
        if (securityChannelRef.current) {
            await supabase.removeChannel(securityChannelRef.current);
            securityChannelRef.current = null;
        }
        await SecureStore.deleteItemAsync('nymly_vault_seed');
        await SecureStore.deleteItemAsync(PRIVATE_KEY_STORE);
        await SecureStore.deleteItemAsync(OWNER_ID_STORE);
        purgeVaultRAM();
        purgeSharedSecrets();
        setOtherDeviceActive(false);
        setVaultState('loading');
    };

    return {
        vaultState,
        otherDeviceActive,
        setupVaultIdentity,
        confirmNewIdentity,
        purgeVaultData,
    };
}
