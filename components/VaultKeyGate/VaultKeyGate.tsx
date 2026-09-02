import { getThemeColor } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
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
 */
export default function VaultKeyGate({ children }: { children: React.ReactNode }) {
    const { vault } = useAuth();
    const [busy, setBusy] = useState(false);

    if (vault.state !== 'needs_new_identity') {
        return <>{children}</>;
    }

    const handleConfirm = () => {
        Alert.alert(
            'Create a new identity?',
            'A fresh set of encryption keys will be generated for this device. Messages that were encrypted with your previous keys will no longer be readable. This cannot be undone.',
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

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                <SymbolView name="key.slash.fill" size={54} tintColor={accent} />
                <Text style={styles.title}>New device detected</Text>
                <Text style={styles.body}>
                    Your encryption keys live only on your devices, and there is no backup. This
                    device doesn&apos;t have them.
                </Text>
                <Text style={styles.body}>
                    You can continue with a brand-new identity, but any messages that were sent to you
                    encrypted with your old keys will stay locked.
                </Text>

                <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: accent }]}
                    onPress={handleConfirm}
                    disabled={busy}
                >
                    {busy
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.primaryBtnText}>Continue with a new identity</Text>}
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 16 },
    title: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center' },
    body: { color: '#9A9A9A', fontSize: 14, lineHeight: 21, textAlign: 'center' },
    primaryBtn: {
        width: '100%', height: 54, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center', marginTop: 12,
    },
    primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
