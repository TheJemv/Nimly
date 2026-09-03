import { getThemeColor } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
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
import PasscodeInput from './PasscodeInput';

const accent = getThemeColor('tint');

/**
 * Compuerta E2EE. Cubre:
 *  - `needs_passcode`   → crear el PIN de 6 dígitos (recuperación / 2º factor).
 *  - `device_locked`    → la cuenta está activa en otro equipo: solo sign out, o
 *                         tomar el control con el PIN (o la contraseña como fallback).
 *  - `needs_new_identity`→ migración (dispositivo sin llaves, cuenta libre).
 */
const GATED: string[] = ['needs_passcode', 'locked_timeout', 'device_locked', 'needs_new_identity'];

export default function VaultKeyGate({ children }: { children: React.ReactNode }) {
    const { vault } = useAuth();
    const state = vault.state;

    if (!GATED.includes(state)) return <>{children}</>;

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                    {state === 'needs_passcode' && <CreatePasscode />}
                    {state === 'locked_timeout' && <UnlockTimeout />}
                    {state === 'device_locked' && <DeviceLocked />}
                    {state === 'needs_new_identity' && <Migrate />}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

// --- Auto-lock periódico (cada 12h) ----------------------------------------
function UnlockTimeout() {
    const { vault } = useAuth();
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fails = useRef(0);

    const onFilled = async (value: string) => {
        setBusy(true);
        setError(null);
        const res = await vault.unlockWithPasscode(value);
        if (!res.ok) {
            fails.current += 1;
            setCode('');
            // Retraso creciente tras varios fallos (protege contra fuerza bruta local).
            if (fails.current >= 5) {
                const wait = Math.min(60, (fails.current - 4) * 15);
                setError(`Wrong passcode. Try again in ${wait}s.`);
                await new Promise((r) => setTimeout(r, wait * 1000));
                setError('Wrong passcode.');
            } else {
                setError(res.message);
            }
        }
        setBusy(false);
    };

    return (
        <>
            <SymbolView name="lock.fill" size={54} tintColor={accent} />
            <Text style={styles.title}>Enter your passcode</Text>
            <Text style={styles.body}>Nimly locks itself periodically. Enter your 6-digit passcode to continue.</Text>

            <PasscodeInput value={code} onChange={setCode} onFilled={onFilled} autoFocus editable={!busy} />

            {busy && <ActivityIndicator color={accent} style={{ marginTop: 20 }} />}
            {error ? <Text style={[styles.body, styles.warn]}>{error}</Text> : null}

            {!busy && (
                <TouchableOpacity style={styles.link} onPress={() => supabase.auth.signOut()}>
                    <Text style={styles.linkText}>Sign out</Text>
                </TouchableOpacity>
            )}
        </>
    );
}

// --- Crear passcode (primer inicio de sesión) --------------------------------
function CreatePasscode() {
    const { vault } = useAuth();
    const [step, setStep] = useState<'enter' | 'confirm'>('enter');
    const [first, setFirst] = useState('');
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onFilled = async (value: string) => {
        setError(null);
        if (step === 'enter') {
            setFirst(value);
            setCode('');
            setStep('confirm');
            return;
        }
        if (value !== first) {
            setError("Those didn't match. Try again.");
            setFirst('');
            setCode('');
            setStep('enter');
            return;
        }
        setBusy(true);
        const res = await vault.createPasscode(value);
        setBusy(false);
        if (!res.ok) {
            setError(res.message);
            setCode('');
        }
    };

    return (
        <>
            <SymbolView name="lock.circle.fill" size={54} tintColor={accent} />
            <Text style={styles.title}>Create a recovery passcode</Text>
            <Text style={styles.body}>
                {step === 'enter'
                    ? 'A 6-digit code you’ll use to move Nimly to a new phone if you ever lose this one. Keep it private — there is no way to reset it.'
                    : 'Enter it again to confirm.'}
            </Text>

            <PasscodeInput
                key={step}
                value={code}
                onChange={setCode}
                onFilled={onFilled}
                autoFocus
                editable={!busy}
            />

            {busy && <ActivityIndicator color={accent} style={{ marginTop: 20 }} />}
            {error ? <Text style={[styles.body, styles.warn]}>{error}</Text> : null}

            {step === 'confirm' && !busy && (
                <TouchableOpacity style={styles.link} onPress={() => { setStep('enter'); setFirst(''); setCode(''); setError(null); }}>
                    <Text style={styles.linkText}>Start over</Text>
                </TouchableOpacity>
            )}

            {!busy && (
                <TouchableOpacity style={styles.link} onPress={() => supabase.auth.signOut()}>
                    <Text style={styles.linkText}>Sign out</Text>
                </TouchableOpacity>
            )}
        </>
    );
}

// --- Cuenta bloqueada en otro dispositivo -----------------------------------
function DeviceLocked() {
    const { vault } = useAuth();
    const [mode, setMode] = useState<'idle' | 'passcode' | 'password'>('idle');
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const signOut = async () => {
        setBusy(true);
        try { await supabase.auth.signOut(); } finally { setBusy(false); }
    };

    const confirmAnd = (run: () => Promise<{ ok: boolean; message?: string }>) => {
        Alert.alert(
            'Take over this account?',
            'The other device will be signed out and any messages encrypted with the old keys stay locked everywhere. Continue only if this account is yours.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Take over',
                    style: 'destructive',
                    onPress: async () => {
                        setBusy(true);
                        setError(null);
                        const res = await run();
                        setBusy(false);
                        if (!res.ok) { setError(res.message ?? 'Something went wrong.'); setCode(''); }
                    },
                },
            ]
        );
    };

    return (
        <>
            <SymbolView name="lock.shield.fill" size={54} tintColor={accent} />
            <Text style={styles.title}>Account in use on another device</Text>
            <Text style={styles.body}>
                Nimly can only be used on one device at a time. Your encrypted messages stay on the device that has your keys.
            </Text>

            {mode === 'idle' && (
                <>
                    <Text style={styles.body}>
                        To use Nimly here, sign out on your other device first, then sign back in.
                    </Text>
                    <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: accent }]} onPress={signOut} disabled={busy}>
                        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Sign out</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.link} onPress={() => setMode('passcode')} disabled={busy}>
                        <Text style={styles.linkText}>I don&apos;t have access to my other device</Text>
                    </TouchableOpacity>
                </>
            )}

            {mode === 'passcode' && (
                <>
                    <Text style={[styles.body, styles.warn]}>
                        Enter your 6-digit recovery passcode to take over. This creates new keys and locks the old message history.
                    </Text>
                    <PasscodeInput value={code} onChange={setCode} autoFocus editable={!busy} />
                    <TouchableOpacity
                        style={[styles.dangerBtn, (busy || code.length !== 6) && styles.btnDisabled]}
                        disabled={busy || code.length !== 6}
                        onPress={() => confirmAnd(() => vault.takeoverWithPasscode(code))}
                    >
                        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Take over this device</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.link} onPress={() => { setMode('password'); setError(null); }} disabled={busy}>
                        <Text style={styles.linkText}>Forgot your passcode? Use account password</Text>
                    </TouchableOpacity>
                </>
            )}

            {mode === 'password' && (
                <>
                    <Text style={[styles.body, styles.warn]}>
                        Enter your account password to take over. This creates new keys and locks the old message history.
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
                        disabled={busy || !password.trim()}
                        onPress={() => confirmAnd(() => vault.forceTakeover(password.trim()))}
                    >
                        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Take over this device</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.link} onPress={() => setMode('passcode')} disabled={busy}>
                        <Text style={styles.linkText}>Use passcode instead</Text>
                    </TouchableOpacity>
                </>
            )}

            {error ? <Text style={[styles.body, styles.warn]}>{error}</Text> : null}
        </>
    );
}

// --- Migración (dispositivo sin llaves, cuenta libre) -----------------------
function Migrate() {
    const { vault } = useAuth();
    const [busy, setBusy] = useState(false);

    const migrate = () => {
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
                        try { await vault.confirmNewIdentity(); }
                        catch { Alert.alert('Error', 'Could not set up this device. Check your connection and try again.'); }
                        finally { setBusy(false); }
                    },
                },
            ]
        );
    };

    return (
        <>
            <SymbolView name="key.slash.fill" size={54} tintColor={accent} />
            <Text style={styles.title}>New device detected</Text>
            <Text style={styles.body}>
                Your encryption keys live only on your devices, and there is no backup. This device doesn&apos;t have them.
            </Text>
            <Text style={styles.body}>
                You can continue with a brand-new identity, but any messages that were sent to you encrypted with your old keys will stay locked.
            </Text>
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: accent }]} onPress={migrate} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Continue with a new identity</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.link} onPress={() => supabase.auth.signOut()} disabled={busy}>
                <Text style={styles.linkText}>Sign out</Text>
            </TouchableOpacity>
        </>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 16 },
    title: { color: '#fff', fontSize: 23, fontWeight: '800', textAlign: 'center' },
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
        alignItems: 'center', justifyContent: 'center', marginTop: 12,
        backgroundColor: '#B3261E',
    },
    btnDisabled: { opacity: 0.5 },
    primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    link: { height: 40, alignItems: 'center', justifyContent: 'center' },
    linkText: { color: '#9A9A9A', fontSize: 13, fontWeight: '600' },
});
