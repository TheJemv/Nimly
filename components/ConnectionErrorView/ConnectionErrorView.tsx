import { getThemeColor } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { SymbolView } from 'expo-symbols';
import React, { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { styles } from './ConnectionErrorView.styles';

type ConnectionErrorViewProps = {
    onRetrySuccess: () => void; // Callback to trigger normal initialization if there's already a network connection
};

export default function ConnectionErrorView({ onRetrySuccess }: ConnectionErrorViewProps) {
    const [isChecking, setIsChecking] = useState(false);

    const handleCheckConnection = async () => {
        if (isChecking) return;
        setIsChecking(true);

        try {
            const startTime = Date.now();
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Timeout")), 4000)
            );

            const pingPromise = supabase.from('profiles').select('id').limit(1).maybeSingle();
            await Promise.race([pingPromise, timeoutPromise]);
            if (__DEV__) console.log(`Connection restored in ${Date.now() - startTime}ms`);
            onRetrySuccess();
        } catch {
            if (__DEV__) console.log("Server still unreachable.");
        } finally {
            setIsChecking(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                {/* ICON WITH SF SYMBOLS - QUIET LUXURY STYLE */}
                <View style={styles.iconCircle}>
                    <SymbolView name="wifi.exclamationmark" size={36} tintColor={getThemeColor('tint')} />
                </View>

                <Text style={styles.title}>Connection Lost</Text>
                <Text style={styles.subtitle}>
                    Nimly can't reach the server right now. Please check your connection and try again.
                </Text>

                {/* BUTTON WITH BUILT-IN LOADING ANIMATION */}
                <TouchableOpacity
                    onPress={handleCheckConnection}
                    style={[styles.confirmBtn, isChecking && styles.disabledBtn]}
                    disabled={isChecking}
                    activeOpacity={0.7}
                >
                    {isChecking ? (
                        <ActivityIndicator color="#000" size="small" />
                    ) : (
                        <Text style={styles.confirmText}>Try Again</Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}