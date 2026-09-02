import { getThemeColor } from '@/constants/theme';
import { supabase, supabaseUrl } from '@/lib/supabase';
import { useRouter } from 'expo-router';
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
    View
} from 'react-native';

export default function LoginScreen() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    // Theme colors
    const textMain = getThemeColor('text');
    const textSec = getThemeColor('textSecondary');
    const accent = getThemeColor('tint');
    const glassBorder = getThemeColor('glassBorder');
    const surface = getThemeColor('surface');
    const bg = getThemeColor("background")

    const handleLogin = async () => {
        if (!username || !password) {
            Alert.alert('Error', 'Please enter your credentials');
            return;
        }

        setLoading(true);
        const fakeEmail = `${username.toLowerCase().trim()}@nimly.com`;
        const { error } = await supabase.auth.signInWithPassword({
            email: fakeEmail,
            password: password,
        });

        if (error) {
            const status = (error as any)?.status ? ` [${(error as any).status}]` : '';
            Alert.alert('Login Error', `${error.message}${status}`);
            setLoading(false);
        } else {
            setLoading(false);
        }
    };

    // Diagnóstico de backend (temporal): confirma qué env vars trae el bundle.
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    const diagLine = `${(supabaseUrl || '—').replace(/^https?:\/\//, '')} · key ${anonKey ? `…${anonKey.slice(-6)}/${anonKey.length}` : 'MISSING'}`;

    return (
        <KeyboardAvoidingView
            behavior="padding"
            style={{ flex: 1, backgroundColor: bg }}
            keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        >
            <ScrollView
                contentContainerStyle={{ flexGrow: 1 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.content}>
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: textMain }]}>Welcome Back</Text>
                        <Text style={[styles.subtitle, { color: textSec }]}>
                            Access your private vault and stay connected.
                        </Text>
                    </View>

                    <View style={styles.form}>
                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: accent }]}>USERNAME</Text>
                            <TextInput
                                style={[styles.input, {
                                    backgroundColor: surface,
                                    color: textMain,
                                    borderColor: glassBorder
                                }]}
                                placeholder="Enter your username"
                                placeholderTextColor={textSec}
                                autoCapitalize="none"
                                value={username}
                                onChangeText={setUsername}
                                selectionColor={accent}
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <View style={styles.labelRow}>
                                <Text style={[styles.label, { color: accent }]}>PASSWORD</Text>
                            </View>
                            <TextInput
                                style={[styles.input, {
                                    backgroundColor: surface,
                                    color: textMain,
                                    borderColor: glassBorder
                                }]}
                                placeholder="Enter your password"
                                placeholderTextColor={textSec}
                                secureTextEntry
                                value={password}
                                onChangeText={setPassword}
                                selectionColor={accent}
                            />
                        </View>

                        <TouchableOpacity
                            style={[styles.buttonPrimary, { backgroundColor: accent }]}
                            onPress={handleLogin}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#ffffff" />
                            ) : (
                                <Text style={styles.buttonText}>ACCESS ACCOUNT</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    <View style={styles.footer}>
                        <Text style={{ color: textSec }}>New to Nimly? </Text>
                        <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
                            <Text style={{ color: accent, fontWeight: 'bold' }}>Join Now</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={{ color: textSec, fontSize: 10, textAlign: 'center', opacity: 0.4, marginTop: 12 }}>
                        {diagLine}
                    </Text>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    content: {
        flex: 1,
        paddingHorizontal: 30,
        paddingTop: 20,
        paddingBottom: 40,
    },
    header: {
        marginTop: 60,
        marginBottom: 40,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    subtitle: {
        fontSize: 16,
        marginTop: 10,
        lineHeight: 22,
    },
    form: {
        gap: 25,
    },
    inputGroup: {
        gap: 8,
    },
    labelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    label: {
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 1.5,
    },
    input: {
        height: 55,
        borderRadius: 8,
        paddingHorizontal: 15,
        borderWidth: 1,
        fontSize: 16,
    },
    buttonPrimary: {
        height: 55,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
    },
    buttonText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 'auto',
        paddingTop: 40,
    }
});