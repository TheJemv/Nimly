import { ThemedText } from "@/components/themed-text";
import { supabase } from "@/lib/supabase";
import { Stack, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function DeleteAccountScreen() {
    const router = useRouter();
    const [seconds, setSeconds] = useState(15);
    const [loading, setLoading] = useState(false);
    const accent = "#FF453A"; // Rojo Apple

    useEffect(() => {
        if (seconds > 0) {
            const timer = setTimeout(() => setSeconds(seconds - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [seconds]);

    const handlePurge = async () => {
        try {
            setLoading(true);
            const { error } = await supabase.rpc('delete_user_account');
            if (error) throw error;

            await supabase.auth.signOut();
            router.replace("/(auth)");
        } catch (e: any) {
            Alert.alert("Could not delete account", e.message);
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerTitle: "Delete Account", headerTransparent: true, headerTintColor: '#fff' }} />

            <View style={styles.content}>
                <SymbolView name="exclamationmark.shield.fill" size={60} tintColor={accent} />

                <ThemedText style={styles.title}>DELETE ACCOUNT</ThemedText>

                <View style={styles.warningBox}>
                    <ThemedText style={styles.warningText}>
                        This permanently deletes your account. This can't be undone and includes:
                    </ThemedText>

                    <View style={styles.list}>
                        <ThemedText style={styles.listItem}>• All your messages and shared media.</ThemedText>
                        <ThemedText style={styles.listItem}>• Your profile and username.</ThemedText>
                        <ThemedText style={styles.listItem}>• All connections, friend requests, and history.</ThemedText>
                        <ThemedText style={styles.listItem}>• Your posts and stories.</ThemedText>
                    </View>

                    <ThemedText style={styles.finalWarning}>
                        Once deleted, Nimly cannot recover your data.
                    </ThemedText>
                </View>

                <TouchableOpacity
                    style={[styles.button, { borderColor: seconds > 0 ? '#333' : accent }]}
                    disabled={seconds > 0 || loading}
                    onPress={handlePurge}
                >
                    {loading ? (
                        <ActivityIndicator color={accent} />
                    ) : (
                        <ThemedText style={[styles.buttonText, { color: seconds > 0 ? '#333' : accent }]}>
                            {seconds > 0 ? `Wait ${seconds}s...` : "DELETE MY ACCOUNT"}
                        </ThemedText>
                    )}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => router.back()} disabled={loading}>
                    <ThemedText style={styles.cancelText}>Cancel</ThemedText>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, gap: 20 },
    title: { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: 2, marginTop: 10 },
    warningBox: { backgroundColor: '#111', padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#222', width: '100%' },
    warningText: { color: '#fff', fontSize: 16, opacity: 0.9, lineHeight: 22, textAlign: 'center' },
    list: { marginVertical: 20, gap: 8 },
    listItem: { color: '#FF453A', fontSize: 14, fontWeight: '600' },
    finalWarning: { color: '#fff', fontSize: 12, opacity: 0.5, textAlign: 'center', fontStyle: 'italic' },
    button: {
        width: '100%',
        padding: 18,
        borderRadius: 15,
        borderWidth: 1.5,
        alignItems: 'center',
        marginTop: 20
    },
    buttonText: { fontSize: 16, fontWeight: '800', letterSpacing: 1 },
    cancelText: { color: '#666', fontSize: 14, fontWeight: '500', marginTop: 10 },
});