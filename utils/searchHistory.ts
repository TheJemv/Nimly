import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Users you opened from Search, saved ON THIS DEVICE only (never synced).
 * Newest first, capped at MAX_ENTRIES, one entry per user. Keyed by account
 * so a different login on the same phone doesn't see your history.
 */

export interface SearchHistoryEntry {
    id: string;
    username: string;
    avatar_config: any;
}

const MAX_ENTRIES = 20;
const storeKey = (userId: string) => `nimly_search_history_v1_${userId}`;

export async function loadSearchHistory(userId: string): Promise<SearchHistoryEntry[]> {
    try {
        const raw = await AsyncStorage.getItem(storeKey(userId));
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/** Moves (or adds) the user to the top and returns the new list. */
export function withSearchHistoryEntry(entries: SearchHistoryEntry[], entry: SearchHistoryEntry): SearchHistoryEntry[] {
    const clean = { id: entry.id, username: entry.username, avatar_config: entry.avatar_config ?? null };
    return [clean, ...entries.filter((e) => e.id !== entry.id)].slice(0, MAX_ENTRIES);
}

export async function saveSearchHistory(userId: string, entries: SearchHistoryEntry[]): Promise<void> {
    try {
        await AsyncStorage.setItem(storeKey(userId), JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    } catch { /* not critical: the history just isn't kept */ }
}
