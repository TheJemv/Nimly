import { getThemeColor } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const accent = getThemeColor('tint');

/**
 * Nimly es de UN solo dispositivo. Este gate cubre dos casos:
 *
 *  - `device_locked`    → la cuenta ya está activa en otro dispositivo. Bloqueo
 *                         duro: solo se puede cerrar sesión, o tomar el control
 *                         con la contraseña ("perdí mi otro dispositivo").
 *  - `needs_new_identity`→ este dispositivo no tiene llaves y la cuenta está
 *                         libre (el otro cerró sesión / se perdió). Migración
 *                         con pérdida del historial cifrado, previa confirmación.
 */
export default function VaultKeyGate({ children }: { children: React.ReactNode }) {
    const { vault } = useAuth();
    const [busy, setBusy] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [password, setPassword] = useState('');

    if (vault.state !== 'needs_new_identity' && vault.state !== 'device_locked') {
        return <>{children}</>;
    }

    const locked = vault.state === 'device_locked';

    const handleSignOut = async () => {
        setBusy(true);
        try {
            await supabase.auth.signOut();
        } finally {
            setBusy(false);
        }
    };

    const handleMigrate = () => {
        Alert.alert(
            'Create a new identity?',
            'A fresh set of encryption keys will be generated for this device. Messages encrypted with your previous keys will no longer be readable. This cannot be undone.',
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

    const handleForceTakeover = () => {
        Alert.alert(
            'Take over this account?',
            'The other device will be signed out and any messages encrypted with the old keys will stay locked everywhere. Continue only if this account is yours.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Take over',
                    style: 'destructive',
                    onPress: async () => {
                        setBusy(true);
                        try {
                            const err = await vault.forceTakeover(password.trim());
                            if (err) Alert.alert('Could not continue', err);
                            else setPassword('');
                        } finally {
                            setBusy(false);
                        }
                    },
                },
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                    <SymbolView name={locked ? 'lock.shield.fill' : 'key.slash.fill'} size={54} tintColor={accent} />

                    {locked ? (
                        <>
                            <Text style={styles.title}>Account in use on another device</Text>
                            <Text style={styles.body}>
                                Nimly can only be used on one device at a time, for your security. Your encrypted
                                messages stay on the device that has your keys.
                            </Text>
                            <Text style={styles.body}>
                                To use Nimly here, sign out on your other device first, then sign back in.
                            </Text>

                            <TouchableOpacity
                                style={[styles.primaryBtn, { backgroundColor: accent }]}
                                onPress={handleSignOut}
                                disabled={busy}
                            >
                                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Sign out</Text>}
                            </TouchableOpacity>

                            {!showPassword ? (
                                <TouchableOpacity style={styles.link} onPress={() => setShowPassword(true)} disabled={busy}>
                                    <Text style={styles.linkText}>I don&apos;t have access to my other device</Text>
                                </TouchableOpacity>
                            ) : (
                                <>
                                    <Text style={[styles.body, styles.warn]}>
                                        Taking over will sign the other device out and permanently lock the old
                                        encrypted history. Enter your password to confirm it&apos;s you.
                                    </Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Account password"
                                        placeholderTextColor="#666"
                                        secureTextEntry
                                        autoCapitalize="none"
                                        value={password}
                                        onChangeText={setPassword}
                                    />
                                    <TouchableOpacity
                                        style={[styles.dangerBtn, (busy || !password.trim()) && styles.btnDisabled]}
                                        onPress={handleForceTakeover}
                                        disabled={busy || !password.trim()}
                                    >
                                        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Take over this device</Text>}
                                    </TouchableOpacity>
                                </>
                            )}
                        </>
                    ) : (
                        <>
                            <Text style={styles.title}>New device detected</Text>
                            <Text style={styles.body}>
                                Your encryption keys live only on your devices, and there is no backup. This device
                                doesn&apos;t have them.
                            </Text>
                            <Text style={styles.body}>
                                You can continue with a brand-new identity, but any messages that were sent to you
                                encrypted with your old keys will stay locked.
                            </Text>

                            <TouchableOpacity
                                style={[styles.primaryBtn, { backgroundColor: accent }]}
                                onPress={handleMigrate}
                                disabled={busy}
                            >
                                {busy
                                    ? <ActivityIndicator color="#fff" />
                                    : <Text style={styles.primaryBtnText}>Continue with a new identity</Text>}
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.link} onPress={handleSignOut} disabled={busy}>
                                <Text style={styles.linkText}>Sign out</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 16 },
    title: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center' },
    body: { color: '#9A9A9A', fontSize: 14, lineHeight: 21, textAlign: 'center' },
    warn: { color: '#E6B800' },
    input: {
        width: '100%', height: 50, borderRadius: 12, paddingHorizontal: 16,
        backgroundColor: '#1C1C1E', color: '#fff', borderWidth: 1, borderColor: '#2C2C2E',
    },
    primaryBtn: {
        width: '100%', height: 54, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center', marginTop: 12,
    },
    dangerBtn: {
        width: '100%', height: 54, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#B3261E',
    },
    btnDisabled: { opacity: 0.5 },
    primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    link: { height: 40, alignItems: 'center', justifyContent: 'center' },
    linkText: { color: '#9A9A9A', fontSize: 13, fontWeight: '600' },
});
