import * as FileSystem from 'expo-file-system/legacy';

/**
 * On-disk cache of chat messages, keyed by the CONVERSATION PARTNER'S user id
 * — not the internal `chat_id` — because the partner id is already known
 * synchronously from route params, while `chat_id` only resolves after a
 * network round trip (`chatApi.getOrCreateChat`). Keying by it lets the chat
 * screen read this cache before any network call has even started.
 *
 * Mirrors exactly what pagination has already loaded for a chat — nothing is
 * pre-fetched ahead of what the user has scrolled to. On reopen this lets the
 * chat render instantly from disk while `useChatSync` reconciles the latest
 * page against the network in the background.
 *
 * Stores rows AS FETCHED FROM THE SERVER (ciphertext + metadata) — never the
 * decrypted plaintext, same E2EE-at-rest guarantee `mediaCache.ts` keeps for
 * media. Decryption still happens at read time via the existing RAM cache
 * (`vaultRAMCache` / `hydrateTextMessages`).
 */

const CACHE_DIR = `${FileSystem.cacheDirectory}chat-message-cache/`;

// Per-chat cap: bounds disk usage/write cost for very long-lived chats even
// though the in-memory paginated list can grow past this during a session.
const MAX_MESSAGES_PER_CHAT = 200;

// Coalesces bursts (realtime, pagination, optimistic send) into one disk write.
const WRITE_DEBOUNCE_MS = 400;

let dirReady: Promise<void> | null = null;

async function ensureDir(): Promise<void> {
    if (!dirReady) {
        dirReady = (async () => {
            const info = await FileSystem.getInfoAsync(CACHE_DIR);
            if (!info.exists) {
                await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
            }
        })().catch((e) => {
            dirReady = null;
            throw e;
        });
    }
    return dirReady;
}

function pathFor(key: string): string {
    return `${CACHE_DIR}${key}.json`;
}

export type CachedChatData = {
    messages: any[];
    hasMore: boolean;
    // Who was signed in when this was written. Bubble side is `sender_id ===
    // currentUserId`, resolved this way rather than at read time so revealing
    // cached messages never has to wait on ANY async call (not even a local
    // session read) to know which side of the chat is "mine".
    currentUserId: string | null;
};

/** Returns whatever's cached for this conversation, or `null` on a miss/read error. */
export async function getCachedMessages(key: string): Promise<CachedChatData | null> {
    try {
        const local = pathFor(key);
        const info = await FileSystem.getInfoAsync(local);
        if (!info.exists || info.isDirectory || info.size === 0) return null;

        const raw = await FileSystem.readAsStringAsync(local, { encoding: 'utf8' });
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed?.messages)) return null;

        return {
            messages: parsed.messages,
            hasMore: parsed.hasMore ?? true,
            currentUserId: parsed.currentUserId ?? null,
        };
    } catch {
        return null;
    }
}

async function writeNow(key: string, data: CachedChatData): Promise<void> {
    try {
        await ensureDir();
        const local = pathFor(key);
        const tmp = `${local}.tmp`;

        // Never persist in-flight/optimistic bubbles, and strip `__plain` as a
        // belt-and-suspenders — decrypted text must never reach disk.
        const safe = data.messages
            .filter((m) => !m.__status)
            .slice(0, MAX_MESSAGES_PER_CHAT)
            .map(({ __plain, ...rest }) => rest);

        await FileSystem.writeAsStringAsync(
            tmp,
            JSON.stringify({ messages: safe, hasMore: data.hasMore, currentUserId: data.currentUserId }),
            { encoding: 'utf8' }
        );
        await FileSystem.moveAsync({ from: tmp, to: local });
    } catch {
        /* best-effort */
    }
}

const pendingWrites = new Map<string, CachedChatData>();
const writeTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounced write — call freely on every message-list change. */
export function scheduleCacheWrite(key: string, data: CachedChatData): void {
    pendingWrites.set(key, data);

    const existing = writeTimers.get(key);
    if (existing) clearTimeout(existing);

    writeTimers.set(
        key,
        setTimeout(() => {
            writeTimers.delete(key);
            const latest = pendingWrites.get(key);
            pendingWrites.delete(key);
            if (latest) void writeNow(key, latest);
        }, WRITE_DEBOUNCE_MS)
    );
}

/** Clears one conversation's cache, or the whole cache when `key` is omitted (e.g. logout). */
export async function clearChatMessageCache(key?: string): Promise<void> {
    if (key) {
        const timer = writeTimers.get(key);
        if (timer) clearTimeout(timer);
        writeTimers.delete(key);
        pendingWrites.delete(key);
        try {
            await FileSystem.deleteAsync(pathFor(key), { idempotent: true });
        } catch {
            /* best-effort */
        }
        return;
    }

    writeTimers.forEach(clearTimeout);
    writeTimers.clear();
    pendingWrites.clear();
    try {
        await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
    } catch {
        /* best-effort */
    } finally {
        dirReady = null;
    }
}
