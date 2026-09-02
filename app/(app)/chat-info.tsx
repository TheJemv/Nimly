import UserAvatar from "@/components/UserAvatar";
import { getThemeColor } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { contactKeys, keyFingerprint } from "@/utils/crypto";
import { formatRelativeTime } from "@/utils/dateFormatter";
import * as Clipboard from "expo-clipboard";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import { blocksApi } from "@/api/blocks";
import { reportsApi } from "@/api/reports";
import { useBlockedUsers } from "@/context/BlockedUsersContext";
import { promptReportReason } from "@/utils/moderation";

const accent = getThemeColor("tint");

type FriendKeyInfo = {
    username?: string;
    avatar_config?: any;
    avatar_url?: string | null;
    public_key?: string | null;
    public_key_updated_at?: string | null;
};

/** Trae el perfil del contacto tolerando que `public_key_updated_at` no exista aún. */
async function fetchFriendKeyInfo(friendId: string): Promise<FriendKeyInfo | null> {
    const full = await supabase
        .from("profiles")
        .select("username, avatar_config, avatar_url, public_key, public_key_updated_at")
        .eq("id", friendId)
        .single();

    if (!full.error) return full.data as FriendKeyInfo;

    const fallback = await supabase
        .from("profiles")
        .select("username, avatar_config, avatar_url, public_key")
        .eq("id", friendId)
        .single();
    return (fallback.data as FriendKeyInfo) ?? null;
}

export default function ChatInfoScreen() {
    const router = useRouter();
    const { chatId, friendId } = useLocalSearchParams<{ chatId: string; friendId: string }>();

    const [loading, setLoading] = useState(true);
    const [friend, setFriend] = useState<FriendKeyInfo | null>(null);
    const [messageCount, setMessageCount] = useState<number | null>(null);
    const [mediaCount, setMediaCount] = useState<number | null>(null);
    const [localKeyChanged, setLocalKeyChanged] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const [f, msgs, media] = await Promise.all([
                    fetchFriendKeyInfo(friendId),
                    chatId
                        ? supabase.from("messages").select("*", { count: "exact", head: true }).eq("chat_id", chatId)
                        : Promise.resolve({ count: 0 } as any),
                    // "Media" = todo mensaje cuyo type no sea 'text' (image, etc.).
                    // Los view-once consumidos pasan a 'text' → dejan de contar, correcto.
                    chatId
                        ? supabase
                            .from("messages")
                            .select("*", { count: "exact", head: true })
                            .eq("chat_id", chatId)
                            .neq("type", "text")
                        : Promise.resolve({ count: 0 } as any),
                ]);
                if (!active) return;

                if (media.error) console.error("chat-info media count error:", media.error);

                setFriend(f);
                setMessageCount(msgs.count ?? 0);
                setMediaCount(media.count ?? 0);

                if (f?.public_key) {
                    const rec = await contactKeys.get(friendId);
                    if (active) setLocalKeyChanged(Boolean(rec && rec.key !== f.public_key));
                }
            } catch (e) {
                console.error("chat-info load error:", e);
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [chatId, friendId]);

    const fingerprint = keyFingerprint(friend?.public_key);

    const keyChangedLabel = (() => {
        if (!friend?.public_key_updated_at) return "Unknown";
        const rel = formatRelativeTime(friend.public_key_updated_at);
        return rel === "Just now" ? rel : `${rel} ago`;
    })();

    const { blockLocally, unblockLocally } = useBlockedUsers();

    const copyChatId = async () => {
        if (!chatId) return;
        await Clipboard.setStringAsync(chatId);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const handleReport = async () => {
        const reason = await promptReportReason("Report user", `Why are you reporting @${friend?.username || 'this user'}?`);
        if (!reason) return;
        try {
            await reportsApi.submitReport({ targetUserId: friendId, reason });
            Alert.alert("Report received", "Thanks. Our team reviews reports within 24 hours.");
        } catch (error: any) {
            if (error.message === "AlreadyReported") {
                Alert.alert("Note", "You have already reported this user.");
            } else {
                Alert.alert("Error", "The report could not be sent.");
            }
        }
    };

    const handleBlock = () => {
        Alert.alert(
            "Block user",
            `@${friend?.username || 'this user'} will no longer be able to contact you or see your content. This also ends your connection.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Block",
                    style: "destructive",
                    onPress: async () => {
                        const reason = await promptReportReason(
                            "Block user",
                            "Tell us what's wrong so we can review this account.",
                        );
                        blockLocally(friendId);
                        try {
                            await blocksApi.blockUser(friendId, reason ?? 'other');
                            router.replace("/(app)/(tabs)/(messages)");
                        } catch (e: any) {
                            if (e?.message !== "AlreadyBlocked") {
                                unblockLocally(friendId);
                                Alert.alert("Error", "Action could not be completed.");
                            } else {
                                router.replace("/(app)/(tabs)/(messages)");
                            }
                        }
                    },
                },
            ],
        );
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <Stack.Screen options={{ headerTitle: "Chat Info", headerStyle: { backgroundColor: "#000" }, headerTintColor: "#fff" }} />
                <ActivityIndicator color={accent} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    headerTitle: "Chat Info",
                    headerStyle: { backgroundColor: "#000" },
                    headerShadowVisible: false,
                    headerTintColor: "#fff",
                }}
            />
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
                {/* Header */}
                <View style={styles.header}>
                    <UserAvatar size={72} avatar_url={friend?.avatar_url} avatar_config={friend?.avatar_config} />
                    <Text style={styles.username}>@{friend?.username || "user"}</Text>
                    <TouchableOpacity
                        style={styles.profileBtn}
                        onPress={() => router.push({ pathname: "/(app)/user/[id]", params: { id: friendId } })}
                    >
                        <Text style={styles.profileBtnText}>View full profile</Text>
                    </TouchableOpacity>
                </View>

                {/* Encryption */}
                <Text style={styles.sectionLabel}>ENCRYPTION</Text>
                <View style={styles.card}>
                    {localKeyChanged && (
                        <View style={styles.warnRow}>
                            <SymbolView name="exclamationmark.triangle.fill" size={16} tintColor="#E6B800" />
                            <Text style={styles.warnText}>
                                This contact&apos;s keys changed since you last saw them on this device.
                            </Text>
                        </View>
                    )}
                    <Row label="Key fingerprint" value={fingerprint} mono />
                    <Row label="Keys last changed" value={keyChangedLabel} last />
                </View>

                {/* Chat */}
                <Text style={styles.sectionLabel}>CHAT</Text>
                <View style={styles.card}>
                    <TouchableOpacity onPress={copyChatId} activeOpacity={0.6}>
                        <Row label="Chat ID" value={copied ? "Copied" : (chatId || "—")} mono />
                    </TouchableOpacity>
                    <Row label="Messages" value={messageCount?.toLocaleString() ?? "—"} />
                    <Row label="Media items" value={mediaCount?.toLocaleString() ?? "—"} last />
                </View>

                {/* Safety */}
                <Text style={styles.sectionLabel}>SAFETY</Text>
                <View style={styles.card}>
                    <TouchableOpacity style={styles.row} activeOpacity={0.6} onPress={handleReport}>
                        <Text style={styles.rowLabel}>Report user</Text>
                        <SymbolView name="exclamationmark.bubble" size={16} tintColor="#9A9A9A" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.row, { borderBottomWidth: 0 }]} activeOpacity={0.6} onPress={handleBlock}>
                        <Text style={[styles.rowLabel, { color: "#FF453A" }]}>Block user</Text>
                        <SymbolView name="hand.raised" size={16} tintColor="#FF453A" />
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
}

function Row({ label, value, mono, last }: { label: string; value: string; mono?: boolean; last?: boolean }) {
    return (
        <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={[styles.rowValue, mono && styles.mono]} numberOfLines={1} ellipsizeMode="middle">
                {value}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#000" },
    center: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
    header: { alignItems: "center", gap: 10, marginBottom: 28 },
    username: { color: "#fff", fontSize: 20, fontWeight: "700" },
    profileBtn: {
        marginTop: 4, paddingHorizontal: 16, paddingVertical: 8,
        borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
    },
    profileBtnText: { color: accent, fontSize: 13, fontWeight: "600" },
    sectionLabel: { color: "#8A8A8A", fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
    card: {
        backgroundColor: "#111", borderRadius: 14, borderWidth: 1,
        borderColor: "rgba(255,255,255,0.06)", paddingHorizontal: 14, marginBottom: 24,
    },
    row: {
        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
        paddingVertical: 14, gap: 16,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)",
    },
    rowLabel: { color: "#9A9A9A", fontSize: 14, flexShrink: 0 },
    rowValue: { color: "#fff", fontSize: 14, flexShrink: 1, textAlign: "right" },
    mono: { fontFamily: "Menlo", fontSize: 12 },
    warnRow: {
        flexDirection: "row", gap: 8, alignItems: "flex-start", paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)",
    },
    warnText: { color: "#E6B800", fontSize: 12.5, lineHeight: 18, flex: 1 },
});
