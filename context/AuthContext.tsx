import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';

import { supabase } from '@/lib/supabase';
import { purgeVaultRAM, vaultIdentity } from '@/utils/crypto';
import { Session } from '@supabase/supabase-js';
import { useRouter, useSegments } from 'expo-router';
import { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';

const AuthContext = createContext<{ session: Session | null; isLoading: boolean }>({
    session: null,
    isLoading: true
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const segments = useSegments();
    const router = useRouter();

    // --- LÓGICA DE SEGURIDAD: SESIÓN ÚNICA (THE HIGHLANDER RULE) ---
    const setupSecuritySync = async (userId: string) => {
        const myDeviceId = `${Device.deviceName}-${Device.modelId}-${Device.osInternalBuildId}`;
        await supabase
            .from('profiles')
            .update({ current_device_id: myDeviceId })
            .eq('id', userId);

        const channelName = `security_check_${userId}`;
        await supabase.removeChannel(supabase.channel(channelName));

        const securityChannel = supabase
            .channel(channelName)
            .on('postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles',
                    filter: `id=eq.${userId}`
                },
                (payload) => {
                    const latestDeviceId = payload.new.current_device_id;
                    if (latestDeviceId && latestDeviceId !== myDeviceId) {
                        handleRemoteLogout();
                    }
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log("Vault Security: Monitoring concurrent sessions...");
                }
            });

        return securityChannel;
    };

    const handleRemoteLogout = async () => {
        Alert.alert(
            "Sesión expirada",
            "Se ha iniciado sesión en otro dispositivo. Por seguridad, la bóveda se reiniciará."
        );

        await supabase.auth.signOut();
    };

    // --- LÓGICA DE INICIALIZACIÓN DE LA BÓVEDA (V2 - ASIMÉTRICA CON SELLO DE IDENTIDAD) ---
    const setupVaultIdentity = async (userSession: Session | null) => {
        if (!userSession?.user) return;
        try {
            const currentUserId = userSession.user.id;

            // 1. Buscamos a quién le pertenece la llave actual en el hardware
            const storedOwnerId = await SecureStore.getItemAsync('nymly_user_id');
            let existingPrivateKey = await SecureStore.getItemAsync('nymly_private_key');

            // 2. FIREWALL: Si la llave le pertenece a otra cuenta, la DESTRUIMOS.
            if (storedOwnerId && storedOwnerId !== currentUserId) {
                console.log("Vault: Account switch detected. Destroying foreign keys...");
                await SecureStore.deleteItemAsync('nymly_private_key');
                existingPrivateKey = null; // Forzamos la recreación
            }

            // 3. Si no hay llave (o la acabamos de destruir), creamos una nueva
            if (!existingPrivateKey) {
                console.log("Vault: Missing identity for this user. Generating True E2EE...");
                await SecureStore.deleteItemAsync('nymly_vault_seed'); // Limpiamos legacy
                await vaultIdentity.generateIdentity();

                // Le ponemos la "etiqueta con nombre" a la nueva llave
                await SecureStore.setItemAsync('nymly_user_id', currentUserId);
            } else {
                console.log("Vault: True E2EE Local identity confirmed for current user.");
                // Por si acaso venimos de una versión vieja que no tenía el ID guardado
                await SecureStore.setItemAsync('nymly_user_id', currentUserId);
            }
        } catch (error) {
            console.error("Vault Initialization Error:", error);
        }
    };

    useEffect(() => {
        let securitySubscription: any = null;

        const checkSession = async () => {
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            setSession(currentSession);

            if (currentSession) {
                await setupVaultIdentity(currentSession);
                securitySubscription = await setupSecuritySync(currentSession.user.id);
            }

            setIsLoading(false);
        };

        checkSession();

        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
            setSession(currentSession);

            if (currentSession) {
                await setupVaultIdentity(currentSession);
                if (!securitySubscription) {
                    securitySubscription = await setupSecuritySync(currentSession.user.id);
                }
            } else if (event === 'SIGNED_OUT') {
                console.log("Vault: User signed out. Purging ALL local security keys...");

                // DESTRUCCIÓN TOTAL DE LA BÓVEDA AL CERRAR SESIÓN
                await SecureStore.deleteItemAsync('nymly_vault_seed');
                await SecureStore.deleteItemAsync('nymly_private_key');
                await SecureStore.deleteItemAsync('nymly_user_id'); // Borramos la etiqueta

                if (securitySubscription) {
                    supabase.removeChannel(securitySubscription);
                    securitySubscription = null;
                }

                console.log("Vault: Rebooting system to clear RAM...");
                purgeVaultRAM();
            }

            setIsLoading(false);
        });

        return () => {
            authListener.subscription.unsubscribe();
            if (securitySubscription) supabase.removeChannel(securitySubscription);
        };
    }, []);

    useEffect(() => {
        if (isLoading) return;

        const inAuthGroup = segments[0] === '(auth)';

        if (!session && !inAuthGroup) {
            router.replace('/(auth)');
        } else if (session && inAuthGroup) {
            router.replace('/(app)/(tabs)/(home)');
        }
    }, [session, segments, isLoading]);

    return (
        <AuthContext.Provider value={{ session, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);