// app/(app)/settings.tsx
import { ThemedText } from "@/components/themed-text";
import { getThemeColor } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { Stack, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import * as Updates from "expo-updates";
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

// 👇 1. Importamos los contextos
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";

export default function SettingsScreen() {
    const router = useRouter();

    // 👇 2. Obtenemos sesión y perfil global directamente de la caché
    const { session } = useAuth();
    const { profile, refreshProfile } = useProfile();

    const [bio, setBio] = useState("");
    const [initialBio, setInitialBio] = useState("");
    const [updating, setUpdating] = useState(false);

    // --- Info de versión / OTA (expo-updates) ---
    const { currentlyRunning, isUpdateAvailable, isUpdatePending } = Updates.useUpdates();
    const [otaStatus, setOtaStatus] = useState<string | null>(null);
    const [checkingOta, setCheckingOta] = useState(false);

    // Huella de la anon key (para diagnosticar env vars mal bundleadas sin exponer el valor).
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
    const anonKeyFP = anonKey ? `…${anonKey.slice(-6)} (${anonKey.length})` : "MISSING";

    const appVersion = Constants.expoConfig?.version ?? "—";
    const runtimeVersion =
        (typeof Updates.runtimeVersion === "string" && Updates.runtimeVersion) || "—";
    const otaChannel = currentlyRunning?.channel ?? Updates.channel ?? "—";
    const isEmbedded = currentlyRunning?.isEmbeddedLaunch ?? true;
    const otaId = isEmbedded ? "Embedded (no OTA)" : (currentlyRunning?.updateId ?? "—");
    const otaShortId = isEmbedded ? otaId : `${otaId.slice(0, 8)}…`;
    const otaDate = currentlyRunning?.createdAt
        ? new Date(currentlyRunning.createdAt).toLocaleString()
        : "—";

    const diagnostics =
        `Nimly v${appVersion}\n` +
        `Runtime: ${runtimeVersion}\n` +
        `Channel: ${otaChannel}\n` +
        `Update: ${otaId}\n` +
        `Published: ${otaDate}\n` +
        `Anon key: ${anonKeyFP}\n` +
        `Platform: ${Platform.OS}`;

    async function checkForOta() {
        // Si ya hay uno descargado esperando, reiniciar es lo único que falta.
        if (isUpdatePending) {
            await Updates.reloadAsync();
            return;
        }
        setOtaStatus(null);
        setCheckingOta(true);
        try {
            const res = await Updates.checkForUpdateAsync();
            if (res.isAvailable) {
                setOtaStatus("Update found, downloading…");
                await Updates.fetchUpdateAsync();
                await Updates.reloadAsync();
            } else {
                setOtaStatus("You're on the latest version.");
            }
        } catch (e: any) {
            setOtaStatus(
                __DEV__
                    ? "OTA updates don't run in development."
                    : `Check failed: ${e?.message ?? e}`
            );
        } finally {
            setCheckingOta(false);
        }
    }

    async function copyDiagnostics() {
        await Clipboard.setStringAsync(diagnostics);
        setOtaStatus("Diagnostics copied to clipboard.");
    }

    // Temas del sistema
    const bg = getThemeColor('background');
    const surface = getThemeColor('surface');
    const accent = getThemeColor('tint');
    const textSec = getThemeColor('textSecondary');
    const glassBorder = getThemeColor('glassBorder');

    // 👇 3. Sincronizamos el estado local cuando el perfil esté listo
    useEffect(() => {
        if (profile) {
            const currentBio = profile.description || "";
            setBio(currentBio);
            setInitialBio(currentBio);
        }
    }, [profile]);

    async function updateBio() {
        if (bio === initialBio || !session?.user?.id) return;

        try {
            setUpdating(true);
            const { error } = await supabase
                .from('profiles')
                .update({ description: bio })
                .eq('id', session.user.id); // 👈 Usamos el ID directamente

            if (error) throw error;

            setInitialBio(bio);
            await refreshProfile(); // 👈 Forzamos recarga en el contexto global para que el resto de la app lo sepa de inmediato
            Alert.alert("Success", "Identity profile updated.");
        } catch (error: any) {
            Alert.alert("Error", error.message);
        } finally {
            setUpdating(false);
        }
    }

    // SIGN OUT: las llaves E2EE viven solo en este dispositivo y no hay respaldo.
    async function handleLogout() {
        Alert.alert(
            "Sign Out",
            "Your encryption keys live only on this device and there is no backup. If you sign out, you will get a new identity next time and your current encrypted messages will no longer be readable.",
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

    // DELETE ACCOUNT: Redirección a la página del timer
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

                    {/* SECCIÓN: SECURITY */}
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

                        {/* DELETE ACCOUNT */}
                        <TouchableOpacity style={styles.menuItem} onPress={goToDeleteAccount}>
                            <View style={[styles.iconBox, { backgroundColor: '#1a0000' }]}>
                                <SymbolView name="trash.fill" size={18} tintColor="#FF453A" />
                            </View>
                            <ThemedText style={[styles.menuText, { color: '#FF453A' }]}>Delete Account</ThemedText>
                            <SymbolView name="chevron.right" size={14} tintColor="#FF453A" />
                        </TouchableOpacity>
                    </View>

                    {/* SECCIÓN: SYSTEM / OTA */}
                    <View style={styles.section}>
                        <ThemedText style={[styles.label, { color: accent }]}>SYSTEM</ThemedText>

                        <TouchableOpacity
                            style={styles.infoCard}
                            activeOpacity={0.7}
                            onLongPress={copyDiagnostics}
                        >
                            <View style={styles.infoRow}>
                                <ThemedText style={styles.infoKey}>App version</ThemedText>
                                <ThemedText style={styles.infoVal}>v{appVersion}</ThemedText>
                            </View>
                            <View style={styles.infoRow}>
                                <ThemedText style={styles.infoKey}>Runtime</ThemedText>
                                <ThemedText style={styles.infoVal}>{runtimeVersion}</ThemedText>
                            </View>
                            <View style={styles.infoRow}>
                                <ThemedText style={styles.infoKey}>Channel</ThemedText>
                                <ThemedText style={styles.infoVal}>{otaChannel}</ThemedText>
                            </View>
                            <View style={styles.infoRow}>
                                <ThemedText style={styles.infoKey}>Update</ThemedText>
                                <ThemedText style={styles.infoVal} numberOfLines={1}>{otaShortId}</ThemedText>
                            </View>
                            <View style={styles.infoRow}>
                                <ThemedText style={styles.infoKey}>Published</ThemedText>
                                <ThemedText style={styles.infoVal} numberOfLines={1}>{otaDate}</ThemedText>
                            </View>
                            <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                                <ThemedText style={styles.infoKey}>Anon key</ThemedText>
                                <ThemedText style={styles.infoVal} numberOfLines={1}>{anonKeyFP}</ThemedText>
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={checkForOta}
                            disabled={checkingOta}
                        >
                            <View style={[styles.iconBox, { backgroundColor: '#333' }]}>
                                {checkingOta
                                    ? <ActivityIndicator size="small" color="#FFF" />
                                    : <SymbolView name="arrow.triangle.2.circlepath" size={18} tintColor="#FFF" />}
                            </View>
                            <ThemedText style={styles.menuText}>
                                {isUpdatePending
                                    ? "Restart to apply update"
                                    : isUpdateAvailable
                                        ? "Downloading update…"
                                        : "Check for updates"}
                            </ThemedText>
                            <SymbolView name="chevron.right" size={14} tintColor={textSec} />
                        </TouchableOpacity>

                        {otaStatus && (
                            <ThemedText style={styles.otaStatus}>{otaStatus}</ThemedText>
                        )}
                        <ThemedText style={styles.hintText}>
                            Long-press the card to copy diagnostics.
                        </ThemedText>
                    </View>

                    {/* Versión actualizada */}
                    <ThemedText style={styles.versionText}>
                        Nimly v{appVersion}
                    </ThemedText>
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
    infoCard: {
        backgroundColor: '#111',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        paddingHorizontal: 14,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        gap: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255,255,255,0.08)',
    },
    infoKey: { fontSize: 13, opacity: 0.5, flexShrink: 0 },
    infoVal: { fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
    otaStatus: { fontSize: 12, opacity: 0.7, marginTop: 4, textAlign: 'center' },
    hintText: { fontSize: 11, opacity: 0.3, textAlign: 'center' },
    versionText: { textAlign: 'center', fontSize: 12, opacity: 0.2, marginTop: 20 }
});