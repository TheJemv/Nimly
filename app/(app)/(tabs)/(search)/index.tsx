import { ESTILOS_DICEBEAR } from "@/constants/dicebear";
import { getThemeColor } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { createAvatar } from "@dicebear/core";
import { GlassView } from 'expo-glass-effect';
import { useRouter } from 'expo-router';
import { SymbolView } from "expo-symbols";
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SvgXml } from "react-native-svg";

const UserSearchResult = ({ item }: { item: any }) => {
    const router = useRouter();

    const avatarSvg = useMemo(() => {
        if (!item.avatar_config) return null;
        const estilo = ESTILOS_DICEBEAR.find(e => e.id === item.avatar_config.styleId) || ESTILOS_DICEBEAR[0];
        return createAvatar(estilo.collection as any, {
            ...item.avatar_config.options,
            radius: 50,
        }).toString();
    }, [item]);

    return (
        <TouchableOpacity
            style={styles.userRow}
            onPress={() => router.push(`/(app)/user/${item.id}`)}
            activeOpacity={0.6}
        >
            <View style={styles.avatarWrapper}>
                {avatarSvg ? (
                    <SvgXml xml={avatarSvg} width="40" height="40" />
                ) : (
                    <View style={styles.placeholderAvatar} />
                )}
            </View>
            <Text style={styles.usernameText}>@{item.username}</Text>
            <SymbolView name="chevron.right" size={14} tintColor="#3A3A3C" weight="semibold" />
        </TouchableOpacity>
    );
};

export default function SearchScreen() {
    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const accent = getThemeColor('tint');

    // 1. Obtener el ID del usuario actual al montar el componente
    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            setCurrentUserId(data.user?.id || null);
        });
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery.trim().length > 0) {
                handleSearch();
            } else {
                setResults([]);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const handleSearch = async () => {
        try {
            setLoading(true);

            let query = supabase
                .from('profiles')
                .select('id, username, avatar_config')
                .ilike('username', `%${searchQuery}%`);

            // 2. FILTRAR: No incluirme a mí mismo en los resultados
            if (currentUserId) {
                query = query.neq('id', currentUserId);
            }

            const { data, error } = await query.limit(20);

            if (error) throw error;
            setResults(data || []);
        } catch (error) {
            console.error('Search error:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Image source={require("@/assets/images/bg-glow-teal.png")} style={styles.bgGlow} />

            <View style={styles.headerContainer}>
                <Text style={styles.headerTitle}>Discover</Text>
                <GlassView style={styles.searchBarGlass}>
                    <View style={styles.searchInner}>
                        <SymbolView name="magnifyingglass" size={16} tintColor="#8E8E93" />
                        <TextInput
                            style={styles.input}
                            placeholder="Search users..."
                            placeholderTextColor="#8E8E93"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoCapitalize="none"
                            selectionColor={accent}
                        />
                    </View>
                </GlassView>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={accent} />
                </View>
            ) : (
                <FlatList
                    data={results}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => <UserSearchResult item={item} />}
                    contentContainerStyle={styles.listPadding}
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                    ListEmptyComponent={() =>
                        searchQuery.length > 0 && !loading && (
                            <Text style={styles.emptyText}>No results found</Text>
                        )
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    bgGlow: { ...StyleSheet.absoluteFillObject, opacity: 0.2 },
    headerContainer: {
        paddingTop: Platform.OS === 'ios' ? 70 : 50,
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    headerTitle: { fontSize: 34, fontWeight: '800', color: '#FFF', letterSpacing: -1, marginBottom: 15 },
    searchBarGlass: { height: 44, borderRadius: 12, overflow: 'hidden' },
    searchInner: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
    input: { flex: 1, marginLeft: 8, fontSize: 17, color: '#FFF' },
    listPadding: { paddingHorizontal: 20, paddingBottom: 100 },
    userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
    avatarWrapper: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', backgroundColor: '#1C1C1E', marginRight: 15 },
    placeholderAvatar: { flex: 1, backgroundColor: '#2C2C2E' },
    usernameText: { flex: 1, fontSize: 17, fontWeight: '500', color: '#FFF', letterSpacing: -0.4 },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.15)', marginLeft: 55 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: { textAlign: 'center', color: '#8E8E93', marginTop: 40, fontSize: 15 }
});