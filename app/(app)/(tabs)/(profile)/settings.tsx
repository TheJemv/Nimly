// app/(app)/settings.tsx
import { ThemedText } from "@/components/themed-text";
import { getThemeColor } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { Stack, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";

export default function SettingsScreen() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [bio, setBio] = useState("");
    const [initialBio, setInitialBio] = useState("");
    const [updating, setUpdating] = useState(false);

    // Temas del sistema
    const bg = getThemeColor('background');
    const surface = getThemeColor('surface');
    const accent = getThemeColor('tint');
    const textSec = getThemeColor('textSecondary');
    const glassBorder = getThemeColor('glassBorder');

    useEffect(() => {
        getProfile();
    }, []);

    async function getProfile() {
        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data } = await supabase
                    .from('profiles')
                    .select('description')
                    .eq('id', user.id)
                    .single();
                if (data) {
                    setBio(data.description || "");
                    setInitialBio(data.description || "");
                }
            }
        } catch (error) {
            console.error("Profile fetch error:", error);
        } finally {
            setLoading(false);
        }
    }

    async function updateBio() {
        if (bio === initialBio) return;
        try {
            setUpdating(true);
            const { data: { user } } = await supabase.auth.getUser();
            const { error } = await supabase
                .from('profiles')
                .update({ description: bio })
                .eq('id', user?.id);

            if (error) throw error;
            setInitialBio(bio);
            Alert.alert("Success", "Identity profile updated.");
        } catch (error: any) {
            Alert.alert("Error", error.message);
        } finally {
            setUpdating(false);
        }
    }

    // 1. SIGN OUT: Con advertencia de pérdida de llaves
    async function handleLogout() {
        Alert.alert(
            "Sign Out",
            "Are you sure? Your security keys are stored locally. If you sign out without a backup, you will lose access to your current encrypted messages forever.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Sign Out",
                    style: "destructive",
                    onPress: () => supabase.auth.signOut()
                }
            ]
        );
    }

    // 2. DELETE ACCOUNT: Redirección a la página del timer
    async function goToDeleteAccount() {
        router.push("/(app)/delete-account");
    }

    const hasChanges = bio !== initialBio;

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1, backgroundColor: bg }}
        >
            <Stack.Screen
                options={{
                    headerTitle: "Vault Settings",
                    headerLargeTitle: true,
                    headerStyle: { backgroundColor: bg },
                    headerTintColor: getThemeColor('text'),
                    headerShadowVisible: false,
                    headerRight: () => (
                        hasChanges ? (
                            <TouchableOpacity onPress={updateBio} disabled={updating}>
                                {updating ? <ActivityIndicator size="small" color={accent} /> :
                                    <ThemedText style={{ color: accent, fontWeight: '700' }}>Save</ThemedText>}
                            </TouchableOpacity>
                        ) : undefined
                    )
                }}
            />

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                contentInsetAdjustmentBehavior="automatic"
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.container}>

                    {/* SECCIÓN: IDENTITY */}
                    <View style={styles.section}>
                        <ThemedText style={[styles.label, { color: accent }]}>PUBLIC IDENTITY</ThemedText>
                        <View style={[styles.inputContainer, { backgroundColor: surface, borderColor: glassBorder }]}>
                            <TextInput
                                style={[styles.input, { color: getThemeColor('text') }]}
                                placeholder="Describe your essence..."
                                placeholderTextColor={textSec}
                                multiline
                                value={bio}
                                onChangeText={setBio}
                                maxLength={150}
                                selectionColor={accent}
                            />
                            <ThemedText style={styles.charCount}>{bio.length}/150</ThemedText>
                        </View>
                    </View>

                    {/* SECCIÓN: SECURITY (Aquí hicimos el cambio) */}
                    <View style={styles.section}>
                        <ThemedText style={[styles.label, { color: accent }]}>SECURITY & PRIVACY</ThemedText>

                        {/* SIGN OUT */}
                        <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
                            <View style={[styles.iconBox, { backgroundColor: '#333' }]}>
                                <SymbolView name="power" size={18} tintColor="#FFF" />
                            </View>
                            <ThemedText style={styles.menuText}>Sign out current session</ThemedText>
                            <SymbolView name="chevron.right" size={14} tintColor={textSec} />
                        </TouchableOpacity>

                        {/* DELETE ACCOUNT (Sustituye a Remote Sessions) */}
                        <TouchableOpacity style={styles.menuItem} onPress={goToDeleteAccount}>
                            <View style={[styles.iconBox, { backgroundColor: '#1a0000' }]}>
                                <SymbolView name="trash.fill" size={18} tintColor="#FF453A" />
                            </View>
                            <ThemedText style={[styles.menuText, { color: '#FF453A' }]}>Delete Account</ThemedText>
                            <SymbolView name="chevron.right" size={14} tintColor="#FF453A" />
                        </TouchableOpacity>
                    </View>

                    <ThemedText style={styles.versionText}>Nymly Discrete v1.0.5</ThemedText>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    scrollContent: { paddingBottom: 40 },
    container: { padding: 20, gap: 30 },
    section: { gap: 12 },
    label: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginBottom: 4, opacity: 0.8 },
    inputContainer: { borderRadius: 16, borderWidth: 1, padding: 16, minHeight: 120 },
    input: { fontSize: 16, textAlignVertical: 'top', lineHeight: 22 },
    charCount: { textAlign: 'right', fontSize: 12, opacity: 0.4, marginTop: 8 },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#111',
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)'
    },
    iconBox: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    menuText: { flex: 1, fontSize: 16, fontWeight: '500' },
    versionText: { textAlign: 'center', fontSize: 12, opacity: 0.2, marginTop: 20 }
});