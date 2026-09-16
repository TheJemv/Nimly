import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from '@/lib/supabase';

/**
 * Media cache ON DISK keyed by *storage path* (not by signed URL).
 *
 * Why: the backend lives on a home server with ~10 Mbps upload, and ALL
 * media goes through that pipe. The app signs URLs (`createSignedUrl`) and the
 * token rotates on every render, so neither Cloudflare nor `expo-image`'s disk
 * cache can reuse anything: we pay bandwidth to view the same image multiple
 * times per session, and from scratch again when reopening the app.
 *
 * This cache stores the file in `FileSystem.cacheDirectory` under a
 * deterministic name derived from `bucket + path`. It survives app close and
 * phone restarts. Flow:
 *   1st view   -> download (slow, unavoidable at 10 Mbps)
 *   next views -> instant local `file://`, zero network (not even the sign call)
 *
 * ONLY for UNENCRYPTED media (posts, stories). For E2EE chat see
 * `getCachedEncryptedText` below: there it's the CIPHERTEXT that gets cached,
 * never the plaintext.
 *
 * Everything is best-effort: if something fails it degrades gracefully
 * (remote URL or `null`), never throws.
 */

const CACHE_DIR = `${FileSystem.cacheDirectory}media-cache/`;

// Disk cache cap. Once exceeded, LRU eviction deletes the oldest files
// (by `modificationTime`) until dropping below EVICT_TARGET_BYTES. Runs in
// the background, never blocks the download.
const MAX_CACHE_BYTES = 300 * 1024 * 1024; // ~300 MB
const EVICT_TARGET_BYTES = 270 * 1024 * 1024; // ~90% — avoids thrashing

// In-flight downloads: two components requesting the same media at once
// result in ONE single download. Key = deterministic local path.
const inFlightBinary = new Map<string, Promise<string | null>>();
const inFlightText = new Map<string, Promise<string | null>>();

let dirReady: Promise<void> | null = null;

async function ensureDir(): Promise<void> {
    if (!dirReady) {
        dirReady = (async () => {
            const info = await FileSystem.getInfoAsync(CACHE_DIR);
            if (!info.exists) {
                await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
            }
        })().catch((e) => {
            // Failed to create the dir -> retry on the next call.
            dirReady = null;
            throw e;
        });
    }
    return dirReady;
}

// Deterministic hash (djb2) to avoid collisions after sanitizing the path.
function hashKey(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
}

/**
 * Deterministic local path for a `bucket + path`. `suffix` forces the extension
 * (used by the chat ciphertext cache with `'enc'`).
 */
function localPathFor(bucket: string, path: string, suffix?: string): string {
    const ext =
        suffix ?? (path.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1] || 'bin').toLowerCase();
    const safe = `${bucket}_${path}`.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 80);
    return `${CACHE_DIR}${safe}_${hashKey(`${bucket}/${path}`)}.${ext}`;
}

async function resolveRemoteUrl(
    bucket: string,
    path: string,
    signed: boolean,
    ttl: number,
): Promise<string | null> {
    if (signed) {
        const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUrl(path, ttl);
        if (error || !data?.signedUrl) return null;
        return data.signedUrl;
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl ?? null;
}

let evicting = false;

/** Best-effort LRU eviction. Runs in the background, non-blocking. */
async function evictIfNeeded(): Promise<void> {
    if (evicting) return;
    evicting = true;
    try {
        const names = await FileSystem.readDirectoryAsync(CACHE_DIR);
        const entries: { uri: string; size: number; mtime: number }[] = [];
        let total = 0;

        for (const name of names) {
            if (name.endsWith('.dl')) continue; // partial downloads
            try {
                const uri = `${CACHE_DIR}${name}`;
                const info = await FileSystem.getInfoAsync(uri);
                if (info.exists && !info.isDirectory) {
                    entries.push({ uri, size: info.size, mtime: info.modificationTime ?? 0 });
                    total += info.size;
                }
            } catch {
                /* ignore unreadable entry */
            }
        }

        if (total <= MAX_CACHE_BYTES) return;

        entries.sort((a, b) => a.mtime - b.mtime); // oldest first
        for (const e of entries) {
            if (total <= EVICT_TARGET_BYTES) break;
            try {
                await FileSystem.deleteAsync(e.uri, { idempotent: true });
                total -= e.size;
            } catch {
                /* ignore */
            }
        }
    } catch {
        /* best-effort */
    } finally {
        evicting = false;
    }
}

function scheduleEviction(): void {
    void evictIfNeeded().catch(() => {});
}

async function downloadBinary(
    bucket: string,
    path: string,
    local: string,
    signed: boolean,
    ttl: number,
): Promise<string | null> {
    let remoteUrl: string | null = null;
    try {
        remoteUrl = await resolveRemoteUrl(bucket, path, signed, ttl);
        if (!remoteUrl) return null;
        await ensureDir();

        const tmp = `${local}.dl`;
        try {
            await FileSystem.deleteAsync(tmp, { idempotent: true });
        } catch {
            /* ignore */
        }

        const res = await FileSystem.downloadAsync(remoteUrl, tmp);
        if (res.status < 200 || res.status >= 300) {
            try {
                await FileSystem.deleteAsync(tmp, { idempotent: true });
            } catch {
                /* ignore */
            }
            return remoteUrl; // degrade: fall back to the remote URL
        }

        const info = await FileSystem.getInfoAsync(tmp);
        if (!info.exists || info.size === 0) {
            try {
                await FileSystem.deleteAsync(tmp, { idempotent: true });
            } catch {
                /* ignore */
            }
            return remoteUrl;
        }

        // `.dl` -> final destination in a single step: never leaves a partial
        // file under the "good" name.
        await FileSystem.moveAsync({ from: tmp, to: local });
        scheduleEviction();
        return local;
    } catch {
        return remoteUrl; // if anything fails, the remote URL (or null)
    }
}

/**
 * Returns a local `file://` for `bucket/path`, downloading it the first time.
 * If the download fails, returns the remote URL as a fallback; if that fails too, `null`.
 *
 * @param opts.signed  `true` -> sign with `createSignedUrl`; `false` -> `getPublicUrl`.
 * @param opts.ttl     seconds the signed URL stays valid for (default 3600).
 */
export async function getCachedMedia(
    bucket: string,
    path: string,
    opts: { signed?: boolean; ttl?: number } = {},
): Promise<string | null> {
    if (!path) return null;

    // If we're already given a resolved URL/file, there's nothing to cache.
    if (/^(https?:|file:|data:)/.test(path)) return path;

    const { signed = false, ttl = 3600 } = opts;

    try {
        const local = localPathFor(bucket, path);

        try {
            const info = await FileSystem.getInfoAsync(local);
            if (info.exists && !info.isDirectory && info.size > 0) {
                return local;
            }
        } catch {
            /* fall through to miss */
        }

        const existing = inFlightBinary.get(local);
        if (existing) return existing;

        const p = downloadBinary(bucket, path, local, signed, ttl).finally(() => {
            inFlightBinary.delete(local);
        });
        inFlightBinary.set(local, p);
        return p;
    } catch {
        try {
            return await resolveRemoteUrl(bucket, path, signed, ttl);
        } catch {
            return null;
        }
    }
}

/**
 * E2EE chat: caches the ENCRYPTED TEXT (never the plaintext — that would break
 * the E2EE-at-rest property). Returns the ciphertext from local disk, or
 * downloads and stores it.
 *
 * @param opts.persist  `false` -> don't write to disk (view-once media).
 */
export async function getCachedEncryptedText(
    bucket: string,
    path: string,
    ttl = 60,
    opts: { persist?: boolean } = {},
): Promise<string | null> {
    if (!path) return null;
    const { persist = true } = opts;

    const local = localPathFor(bucket, path, 'enc');

    try {
        if (persist) {
            try {
                const info = await FileSystem.getInfoAsync(local);
                if (info.exists && !info.isDirectory && info.size > 0) {
                    return await FileSystem.readAsStringAsync(local, { encoding: 'utf8' });
                }
            } catch {
                /* fall through to miss */
            }
        }

        const existing = inFlightText.get(local);
        if (existing) return existing;

        const p = (async (): Promise<string | null> => {
            try {
                const { data, error } = await supabase.storage
                    .from(bucket)
                    .createSignedUrl(path, ttl);
                if (error || !data?.signedUrl) return null;

                const res = await fetch(data.signedUrl);
                if (!res.ok) return null;
                const text = await res.text();
                if (!text) return null;

                if (persist) {
                    try {
                        await ensureDir();
                        const tmp = `${local}.dl`;
                        await FileSystem.writeAsStringAsync(tmp, text, { encoding: 'utf8' });
                        await FileSystem.moveAsync({ from: tmp, to: local });
                        scheduleEviction();
                    } catch {
                        /* the ciphertext is still returned from RAM */
                    }
                }
                return text;
            } catch {
                return null;
            } finally {
                inFlightText.delete(local);
            }
        })();
        inFlightText.set(local, p);
        return p;
    } catch {
        return null;
    }
}

/** Clears the entire on-disk media cache (e.g. on logout). */
export async function clearMediaCache(): Promise<void> {
    try {
        await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
    } catch {
        /* best-effort */
    } finally {
        dirReady = null;
        inFlightBinary.clear();
        inFlightText.clear();
    }
}
