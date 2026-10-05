import EmptyState from '@/components/EmptyState';
import { ESTILOS_DICEBEAR } from "@/constants/dicebear";
import { getThemeColor } from '@/constants/theme';
import { useBlockedUsers } from '@/context/BlockedUsersContext';
import { supabase } from '@/lib/supabase';
import {
    loadSearchHistory,
    saveSearchHistory,
    SearchHistoryEntry,
    withSearchHistoryEntry,
} from '@/utils/searchHistory';
import { createAvatar } from "@dicebear/core";
import { GlassView } from 'expo-glass-effect';
import { useRouter } from 'expo-router';
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SvgXml } from "react-native-svg";

interface UserSearchResultProps {
    item: any;
    onPress: () => void;
    /** Recent searches: an X to remove it instead of the chevron. */
    onRemove?: () => void;
}

const UserSearchResult = ({ item, onPress, onRemove }: UserSearchResultProps) => {
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
            onPress={onPress}
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
            {onRemove ? (
                <TouchableOpacity onPress={onRemove} hitSlop={12} style={styles.removeButton} accessibilityLabel="Remove from recent searches">
                    <SymbolView name="xmark" size={14} tintColor={getThemeColor("textSecondary")} weight="semibold" />
                </TouchableOpacity>
            ) : (
                <SymbolView name="chevron.right" size={14} tintColor={getThemeColor("icon")} weight="semibold" />
            )}
        </TouchableOpacity>
    );
};

export default function SearchScreen() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    // The text `results` belongs to: "No results" waits for the search of what's
    // typed instead of flashing during the debounce.
    const [searchedQuery, setSearchedQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const { isBlocked, blockedIds } = useBlockedUsers();
    const accent = getThemeColor('tint');

    const visibleResults = useMemo(
        () => results.filter((r) => !isBlocked(r.id)),
        [results, isBlocked, blockedIds],
    );

    // Recent searches (last 20 people you opened from here, newest first),
    // stored on the device only. Shown while the search box is empty.
    const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
    const visibleHistory = useMemo(
        () => history.filter((h) => !isBlocked(h.id)),
        [history, isBlocked, blockedIds],
    );
    const showingHistory = searchQuery.trim().length === 0;

    // 1. Get the current user's ID when the component mounts
    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            setCurrentUserId(data.user?.id || null);
        });
    }, []);

    useEffect(() => {
        if (!currentUserId) return;
        loadSearchHistory(currentUserId).then(setHistory);
    }, [currentUserId]);

    const updateHistory = (update: (prev: SearchHistoryEntry[]) => SearchHistoryEntry[]) => {
        setHistory((prev) => {
            const next = update(prev);
            if (currentUserId) saveSearchHistory(currentUserId, next);
            return next;
        });
    };

    const openUser = (user: SearchHistoryEntry) => {
        updateHistory((prev) => withSearchHistoryEntry(prev, user));
        router.push(`/(app)/user/${user.id}`);
    };

    const removeFromHistory = (userId: string) => {
        updateHistory((prev) => prev.filter((h) => h.id !== userId));
    };

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

            // 2. FILTER: Don't include myself in the results
            if (currentUserId) {
                query = query.neq('id', currentUserId);
            }

            const { data, error } = await query.limit(20);

            if (error) throw error;
            setResults(data || []);
            setSearchedQuery(searchQuery.trim());
        } catch (error) {
            console.error('Search error:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.headerContainer}>
                <Text style={styles.headerTitle}>Discover</Text>
                <GlassView style={styles.searchBarGlass}>
                    <View style={styles.searchInner}>
                        <SymbolView name="magnifyingglass" size={16} tintColor={getThemeColor("textSecondary")} />
                        <TextInput
                            style={styles.input}
                            placeholder="Search users..."
                            placeholderTextColor={getThemeColor("textSecondary")}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoCapitalize="none"
                            autoCorrect={false}       // Disables word autocorrect on iOS/Android
                            spellCheck={false}        // Removes the red underline that flags spelling "errors"
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
                    data={showingHistory ? visibleHistory : visibleResults}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        <UserSearchResult
                            item={item}
                            onPress={() => openUser(item)}
                            onRemove={showingHistory ? () => removeFromHistory(item.id) : undefined}
                        />
                    )}
                    // Rows and X work on the first tap even with the keyboard up.
                    keyboardShouldPersistTaps="handled"
                    ListHeaderComponent={
                        showingHistory && visibleHistory.length > 0
                            ? <Text style={styles.sectionTitle}>Recent</Text>
                            : null
                    }
                    contentContainerStyle={styles.listPadding}
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                    ListEmptyComponent={
                        showingHistory ? (
                            <EmptyState
                                icon="person.2"
                                title="Find your friends"
                                message="Search people by their username and add them to see their posts and stories."
                                style={styles.empty}
                            />
                        ) : searchedQuery === searchQuery.trim() ? (
                            <EmptyState
                                icon="magnifyingglass"
                                title="No results"
                                message={`No one goes by "${searchQuery.trim()}". Check the spelling and try again.`}
                                style={styles.empty}
                            />
                        ) : null
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000000' },
    headerContainer: {
        paddingTop: Platform.OS === 'ios' ? 70 : 50,
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    headerTitle: { fontSize: 34, fontWeight: '800', color: getThemeColor("text"), letterSpacing: -1, marginBottom: 15 },
    searchBarGlass: { height: 44, borderRadius: 12, overflow: 'hidden' },
    searchInner: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
    input: { flex: 1, marginLeft: 8, fontSize: 17, color: '#FFF' },
    listPadding: { paddingHorizontal: 20, paddingBottom: 100 },
    userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
    avatarWrapper: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', backgroundColor: getThemeColor("surface"), marginRight: 15 },
    placeholderAvatar: { flex: 1, backgroundColor: getThemeColor("border") },
    usernameText: { flex: 1, fontSize: 17, fontWeight: '500', color: '#FFF', letterSpacing: -0.4 },
    removeButton: { padding: 4 },
    sectionTitle: { fontSize: 15, fontWeight: '600', color: getThemeColor("textSecondary"), marginBottom: 4 },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.15)', marginLeft: 55 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    empty: { marginTop: 60 },
});