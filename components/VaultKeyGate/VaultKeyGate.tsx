import { getThemeColor } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const accent = getThemeColor('tint');

/**
 * Cuando este dispositivo no tiene las llaves E2EE del usuario pero el servidor
 * ya registra una identidad suya (reinstalación / dispositivo nuevo), bloquea la
 * app y pide confirmación explícita antes de crear una identidad nueva —nunca en
 * silencio— porque implica perder el acceso al historial cifrado anterior.
 *
 * Si además hay OTRO dispositivo activo con esas llaves (inicio de sesión ajeno
 * / cuenta compartida), muestra un aviso de seguridad reforzado: continuar aquí
 * bloquea al otro dispositivo.
 */
export default function VaultKeyGate({ children }: { children: React.ReactNode }) {
    const { vault } = useAuth();
    const [busy, setBusy] = useState(false);

    if (vault.state !== 'needs_new_identity') {
        return <>{children}</>;
    }

    const foreign = vault.otherDeviceActive;

    const handleConfirm = () => {
        Alert.alert(
            foreign ? 'Take over encryption on this device?' : 'Create a new identity?',
            foreign
                ? 'New encryption keys will be generated here and the other device will lose access. Messages encrypted with the previous keys will stay locked on every device. Only continue if this account is yours.'
                : 'A fresh set of encryption keys will be generated for this device. Messages that were encrypted with your previous keys will no longer be readable. This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Continue',
                    style: 'destructive',
                    onPress: async () => {
                        setBusy(true);
                        try {
                            await vault.confirmNewIdentity();
                        } catch {
                            Alert.alert('Error', 'Could not set up this device. Check your connection and try again.');
                        } finally {
                            setBusy(false);
                        }
                    },
                },
            ]
        );
    };

    const handleSignOut = async () => {
        setBusy(true);
        try {
            await supabase.auth.signOut();
        } finally {
            setBusy(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <SymbolView name={foreign ? 'lock.shield.fill' : 'key.slash.fill'} size={54} tintColor={accent} />

                <Text style={styles.title}>
                    {foreign ? 'This account is protected on another device' : 'New device detected'}
                </Text>

                {foreign ? (
                    <>
                        <Text style={styles.body}>
                            Nimly&apos;s encryption keys never leave the device that created them, and there is no
                            backup. Your past and current encrypted messages can only be read on that device.
                        </Text>
                        <Text style={styles.body}>
                            If you&apos;re switching phones, you can continue here — but the other device will be
                            signed out of encryption and the old message history stays locked everywhere.
                        </Text>
                        <Text style={[styles.body, styles.warn]}>
                            If you didn&apos;t just sign in on this device, sign out and change your password.
                        </Text>
                    </>
                ) : (
                    <>
                        <Text style={styles.body}>
                            Your encryption keys live only on your devices, and there is no backup. This
                            device doesn&apos;t have them.
                        </Text>
                        <Text style={styles.body}>
                            You can continue with a brand-new identity, but any messages that were sent to you
                            encrypted with your old keys will stay locked.
                        </Text>
                    </>
                )}

                <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: accent }]}
                    onPress={handleConfirm}
                    disabled={busy}
                >
                    {busy
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.primaryBtnText}>
                            {foreign ? 'Continue on this device' : 'Continue with a new identity'}
                        </Text>}
                </TouchableOpacity>

                {foreign && (
                    <TouchableOpacity style={styles.secondaryBtn} onPress={handleSignOut} disabled={busy}>
                        <Text style={styles.secondaryBtnText}>Sign out</Text>
                    </TouchableOpacity>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 16 },
    title: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center' },
    body: { color: '#9A9A9A', fontSize: 14, lineHeight: 21, textAlign: 'center' },
    warn: { color: '#E6B800' },
    primaryBtn: {
        width: '100%', height: 54, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center', marginTop: 12,
    },
    primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    secondaryBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
    secondaryBtnText: { color: '#9A9A9A', fontSize: 14, fontWeight: '600' },
});
