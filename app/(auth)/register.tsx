import { getThemeColor } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
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
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);

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

        if (!termsAccepted) {
            Alert.alert('Terms Required', 'You must accept the Terms of Use to create an account.');
            return;
        }

        setLoading(true);

        const fakeEmail = `${username.toLowerCase().trim()}@nimly.com`;

        const { error } = await supabase.auth.signUp({
            email: fakeEmail,
            password: password,
            options: {
                data: {
                    username: username.trim(),
                    terms_accepted: true,
                    terms_accepted_at: new Date().toISOString(),
                }
            }
        });

        if (error) {
            Alert.alert('Registration Error', error.message);
            setLoading(false);
        } else {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1, backgroundColor: bg }}
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
                            selectionColor={getThemeColor('tint')}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: accent }]}>PASSWORD</Text>

                        {/* Contenedor que agrupa el botón izquierdo y el TextInput */}
                        <View style={[styles.inputWrapper, { backgroundColor: surface, borderColor: glassBorder }]}>
                            <TextInput
                                style={[styles.inputInner, { color: textMain }]}
                                placeholder="Min. 6 characters"
                                placeholderTextColor={textSec}
                                secureTextEntry={!showPassword}
                                value={password}
                                onChangeText={setPassword}
                                selectionColor={getThemeColor('tint')}
                            />

                            <TouchableOpacity
                                style={styles.eyeButton}
                                onPress={() => setShowPassword(!showPassword)}
                                activeOpacity={0.7}
                            >
                                <SymbolView size={24} name={showPassword ? "eye.slash" : "eye"} tintColor={"#fff"} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* ——— TERMS CHECKBOX ——— */}
                    <TouchableOpacity
                        style={styles.termsRow}
                        onPress={() => setTermsAccepted(!termsAccepted)}
                        activeOpacity={0.7}
                    >
                        <View style={[
                            styles.checkbox,
                            {
                                borderColor: termsAccepted ? accent : glassBorder,
                                backgroundColor: termsAccepted ? accent : 'transparent',
                            }
                        ]}>
                            {termsAccepted && (
                                <Text style={styles.checkmark}>✓</Text>
                            )}
                        </View>

                        <Text style={[styles.termsText, { color: textSec }]}>
                            I have read and accept the{' '}
                            <Text
                                style={[styles.termsLink, { color: accent }]}
                                onPress={() => router.push('/(auth)/terms')}
                            >
                                Terms of Use
                            </Text>
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.buttonPrimary,
                            {
                                backgroundColor: termsAccepted ? accent : surface,
                                borderWidth: termsAccepted ? 0 : 1,
                                borderColor: glassBorder,
                            }
                        ]}
                        onPress={handleSignUp}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#ffffff" />
                        ) : (
                            <Text style={[
                                styles.buttonText,
                                { color: termsAccepted ? '#ffffff' : textSec }
                            ]}>
                                CREATE ACCOUNT
                            </Text>
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

    // ——— INPUT WRAPPER CON BOTÓN A LA IZQUIERDA ———
    inputWrapper: {
        height: 55,
        borderRadius: 8,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 12,
    },
    eyeButton: {
        paddingRight: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    eyeIcon: {
        fontSize: 18,
    },
    inputInner: {
        flex: 1,
        height: '100%',
        paddingRight: 15,
        fontSize: 16,
    },

    // ——— TERMS ———
    termsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: -8,
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 5,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    checkmark: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: 'bold',
        lineHeight: 16,
    },
    termsText: {
        fontSize: 13,
        lineHeight: 20,
        flex: 1,
    },
    termsLink: {
        fontWeight: '700',
        textDecorationLine: 'underline',
    },
    // ——— BUTTON ———
    buttonPrimary: {
        height: 55,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
    },
    buttonText: {
        fontSize: 14,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 40,
    },
});