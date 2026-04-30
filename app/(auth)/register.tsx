import { getThemeColor } from '@/constants/theme';
import { supabase } from '@/lib/supabase'; // Asegúrate de tener tu cliente configurado
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

export default function RegisterScreen() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    // Theme colors
    const bg = getThemeColor('background');
    const textMain = getThemeColor('text');
    const textSec = getThemeColor('textSecondary');
    const accent = getThemeColor('tint');
    const glassBorder = getThemeColor('glassBorder');
    const surface = getThemeColor('surface');

    const handleSignUp = async () => {
        if (!username || !password) {
            Alert.alert('Error', 'Please fill in all fields');
            return;
        }

        setLoading(true);

        // El truco del email fake para usar solo Username
        const fakeEmail = `${username.toLowerCase().trim()}@nimly.com`;

        const { error } = await supabase.auth.signUp({
            email: fakeEmail,
            password: password,
            options: {
                data: {
                    username: username.trim(),
                }
            }
        });

        if (error) {
            Alert.alert('Registration Error', error.message);
            setLoading(false);
        } else {
            // El AuthContext detectará la sesión y redirigirá a (app)
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
        >
            <View style={styles.content}>
                <View style={styles.header}>
                    <Text style={[styles.title, { color: textMain }]}>Join Nimly</Text>
                    <Text style={[styles.subtitle, { color: textSec }]}>
                        Create your unique identity in our private network.
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
                            placeholder="Choose a unique username"
                            placeholderTextColor={textSec}
                            autoCapitalize="none"
                            value={username}
                            onChangeText={setUsername}
                            selectionColor={getThemeColor("tint")}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: accent }]}>PASSWORD</Text>
                        <TextInput
                            style={[styles.input, {
                                backgroundColor: surface,
                                color: textMain,
                                borderColor: glassBorder
                            }]}
                            placeholder="Min. 6 characters"
                            placeholderTextColor={textSec}
                            secureTextEntry
                            value={password}
                            onChangeText={setPassword}
                            selectionColor={getThemeColor("tint")}
                        />
                    </View>

                    <TouchableOpacity
                        style={[styles.buttonPrimary, { backgroundColor: accent }]}
                        onPress={handleSignUp}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#ffffff" />
                        ) : (
                            <Text style={styles.buttonText}>CREATE ACCOUNT</Text>
                        )}
                    </TouchableOpacity>
                </View>

                <View style={styles.footer}>
                    <Text style={{ color: textSec }}>Already have an account? </Text>
                    <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
                        <Text style={{ color: accent, fontWeight: 'bold' }}>Enter here</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        flex: 1,
        paddingHorizontal: 30,
        paddingTop: 20,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
    },
    header: {
        marginTop: 40,
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
        marginTop: 40,
    }
});