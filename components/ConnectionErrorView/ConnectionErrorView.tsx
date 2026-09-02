import { getThemeColor } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { SymbolView } from 'expo-symbols';
import React, { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { styles } from './ConnectionErrorView.styles';

type ConnectionErrorViewProps = {
    onRetrySuccess: () => void; // Callback para disparar la inicialización normal si ya hay red
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
                {/* ICONO CON SF SYMBOLS - ESTILO QUIET LUXURY */}
                <View style={styles.iconCircle}>
                    <SymbolView name="wifi.exclamationmark" size={36} tintColor={getThemeColor('tint')} />
                </View>

                <Text style={styles.title}>Connection Lost</Text>
                <Text style={styles.subtitle}>
                    Nimly can't reach the server right now. Please check your connection and try again.
                </Text>

                {/* BOTÓN CON ANIMACIÓN DE CARGA INTEGRADA */}
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