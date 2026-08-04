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
            // 1. FIREWALes DE INFRAESTRUCTURA: Hacemos un ping ultra-rápido y directo a la API de Supabase
            const startTime = Date.now();

            // Forzamos un timeout de 4 segundos para no dejar colgado al usuario si la señal es pésima
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Timeout")), 4000)
            );

            const pingPromise = supabase.from('profiles').select('id').limit(1).maybeSingle();

            // Competencia de promesas para romper bloqueos de red
            await Promise.race([pingPromise, timeoutPromise]);

            console.log(`📡 [NETWORK_VAULT] Connection restored in ${Date.now() - startTime}ms`);

            // 2. Si la consulta responde con éxito, disparamos el callback para desbloquear el Home
            onRetrySuccess();
        } catch (e) {
            console.log("❌ [NETWORK_VAULT] Server unreachable. Still offline.");
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

                <Text style={styles.title}>Secure Connection Lost</Text>
                <Text style={styles.subtitle}>
                    The cryptographic vault cannot sync with the server. Please check your signal and try again.
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
                        <Text style={styles.confirmText}>Connect Vault</Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}