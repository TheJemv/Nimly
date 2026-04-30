// app/(auth)/index.tsx
import { Fonts, getThemeColor } from '@/constants/theme';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from "react-native-safe-area-context";

export default function WelcomeScreen() {
    const router = useRouter();

    // Crimson Glass Theme extraction
    const bg = getThemeColor('background');
    const textMain = getThemeColor('text');
    const textSec = getThemeColor('textSecondary');
    const accent = getThemeColor('tint');
    const glassBorder = getThemeColor('glassBorder');
    const glassBg = getThemeColor('glassBackground');

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
            <View style={styles.content}>

                {/* VIP Header */}
                <View style={styles.logoContainer}>
                    <View style={[styles.glassIcon, { borderColor: glassBorder, backgroundColor: glassBg }]}>
                        <Text style={[styles.logoLetter, { color: accent }]}>N</Text>
                    </View>
                    <Text style={[styles.title, { color: textMain, fontFamily: Fonts?.sans }]}>Nimly</Text>
                    <View style={[styles.badge, { backgroundColor: glassBorder }]}>
                        <Text style={[styles.badgeText, { color: accent }]}>EARLY ACCESS</Text>
                    </View>
                </View>

                {/* Welcome Message */}
                <View style={styles.textContainer}>
                    <Text style={[styles.description, { color: textSec }]}>
                        Absolute privacy. Exclusive connections.
                        Your discreet space on the network.
                    </Text>
                </View>

                {/* Glassmorphism Actions */}
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.buttonPrimary, { backgroundColor: accent }]}
                        activeOpacity={0.8}
                        onPress={() => router.push('/(auth)/register')}
                    >
                        <Text style={[styles.buttonTextPrimary, { color: '#ffffff' }]}>
                            Begin Registration
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.buttonSecondary, { borderColor: glassBorder, backgroundColor: glassBg }]}
                        activeOpacity={0.7}
                        onPress={() => router.push('/(auth)/login')}
                    >
                        <Text style={[styles.buttonTextSecondary, { color: textMain }]}>
                            Enter Account
                        </Text>
                    </TouchableOpacity>

                    <Text style={[styles.legal, { color: textSec }]}>
                        By entering, you agree to Nimly's discretion terms.
                    </Text>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        flex: 1,
        paddingHorizontal: 40,
        justifyContent: 'space-between',
        paddingVertical: 60,
    },
    logoContainer: {
        alignItems: 'center',
        marginTop: 40,
    },
    glassIcon: {
        width: 90,
        height: 90,
        borderRadius: 25,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        shadowColor: '#DC143C',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 15,
        elevation: 5,
    },
    logoLetter: {
        fontSize: 50,
        fontWeight: 'bold',
    },
    title: {
        fontSize: 38,
        fontWeight: '700',
        letterSpacing: 3,
        textTransform: 'uppercase',
    },
    badge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 20,
        marginTop: 10,
    },
    badgeText: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 2,
    },
    textContainer: {
        alignItems: 'center',
    },
    description: {
        fontSize: 16,
        textAlign: 'center',
        lineHeight: 24,
        letterSpacing: 0.5,
    },
    footer: {
        gap: 15,
    },
    buttonPrimary: {
        paddingVertical: 18,
        borderRadius: 8,
        alignItems: 'center',
    },
    buttonTextPrimary: {
        fontSize: 15,
        fontWeight: 'bold',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    buttonSecondary: {
        paddingVertical: 18,
        borderRadius: 8,
        alignItems: 'center',
        borderWidth: 1,
    },
    buttonTextSecondary: {
        fontSize: 15,
        fontWeight: '600',
    },
    legal: {
        textAlign: 'center',
        fontSize: 11,
        marginTop: 15,
        opacity: 0.6,
    }
});