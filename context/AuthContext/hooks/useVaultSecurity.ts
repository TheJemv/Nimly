import { supabase } from '@/lib/supabase';
import { purgeVaultRAM, vaultIdentity } from '@/utils/crypto';
import { Session } from '@supabase/supabase-js';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';

export function useVaultSecurity() {
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
                    if (status === 'SUBSCRIBED') console.log("Vault Security: Monitoring concurrent sessions...");
                });

            return securityChannel;
        } catch (e) {
            console.error("Security sync failed silently:", e);
            return null;
        }
    };

    const setupVaultIdentity = async (userSession: Session | null) => {
        if (!userSession?.user) return;
        try {
            const currentUserId = userSession.user.id;
            const storedOwnerId = await SecureStore.getItemAsync('nymly_user_id');
            let existingPrivateKey = await SecureStore.getItemAsync('nymly_private_key');

            if (storedOwnerId && storedOwnerId !== currentUserId) {
                console.log("Vault: Account switch detected. Destroying foreign keys...");
                await SecureStore.deleteItemAsync('nymly_private_key');
                existingPrivateKey = null;
            }

            if (!existingPrivateKey) {
                console.log("Vault: Missing identity for this user. Generating True E2EE...");
                await SecureStore.deleteItemAsync('nymly_vault_seed');
                await vaultIdentity.generateIdentity();
                await SecureStore.setItemAsync('nymly_user_id', currentUserId);
            } else {
                console.log("Vault: True E2EE Local identity confirmed for current user.");
                await SecureStore.setItemAsync('nymly_user_id', currentUserId);
            }
        } catch (error) {
            console.error("Vault Initialization Error:", error);
        }
    };

    const purgeVaultData = async () => {
        console.log("Vault: User signed out. Purging ALL local security keys...");
        await SecureStore.deleteItemAsync('nymly_vault_seed');
        await SecureStore.deleteItemAsync('nymly_private_key');
        await SecureStore.deleteItemAsync('nymly_user_id');
        console.log("Vault: Rebooting system to clear RAM...");
        purgeVaultRAM();
    };

    return { setupSecuritySync, setupVaultIdentity, purgeVaultData };
}