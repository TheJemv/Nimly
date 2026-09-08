import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from '@/lib/supabase';

/**
 * Caché de media EN DISCO por *path del storage* (no por URL firmada).
 *
 * Motivo: el backend vive en un servidor casero con ~10 Mbps de subida y TODO
 * el media sale por ese tubo. La app firma URLs (`createSignedUrl`) y el token
 * rota en cada render, así que ni Cloudflare ni el caché de disco de
 * `expo-image` pueden reutilizar nada: pagamos ancho de banda por ver la misma
 * imagen varias veces por sesión y de cero al reabrir la app.
 *
 * Este caché guarda el archivo en `FileSystem.cacheDirectory` con un nombre
 * determinista derivado de `bucket + path`. Sobrevive al cierre de la app y al
 * reinicio del teléfono. Flujo:
 *   1ª vista  -> descarga (lento, inevitable con 10 Mbps)
 *   siguientes -> `file://` local instantáneo, cero red (ni la llamada a firmar)
 *
 * SOLO para media NO cifrada (posts, historias). Para el chat E2EE ver
 * `getCachedEncryptedText` más abajo: ahí se cachea el CIFRADO, nunca el
 * plaintext.
 *
 * Todo es best-effort: si algo falla se degrada (URL remota o `null`), nunca
 * tira.
 */

const CACHE_DIR = `${FileSystem.cacheDirectory}media-cache/`;

// Tope del caché en disco. Al pasarlo, la eviction LRU borra los archivos más
// viejos (por `modificationTime`) hasta bajar de EVICT_TARGET_BYTES. Corre en
// background, nunca bloquea la descarga.
const MAX_CACHE_BYTES = 300 * 1024 * 1024; // ~300 MB
const EVICT_TARGET_BYTES = 270 * 1024 * 1024; // ~90% — evita thrashing

// Descargas en vuelo: dos componentes pidiendo el mismo media a la vez hacen
// UNA sola descarga. Clave = path local determinista.
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
            // Falló crear el dir -> reintentar en la próxima llamada.
            dirReady = null;
            throw e;
        });
    }
    return dirReady;
}

// Hash determinista (djb2) para evitar colisiones tras sanitizar el path.
function hashKey(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
}

/**
 * Path local determinista para un `bucket + path`. `suffix` fuerza la extensión
 * (lo usa el caché de ciphertext del chat con `'enc'`).
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

/** Eviction LRU best-effort. Corre en background, no bloquea. */
async function evictIfNeeded(): Promise<void> {
    if (evicting) return;
    evicting = true;
    try {
        const names = await FileSystem.readDirectoryAsync(CACHE_DIR);
        const entries: { uri: string; size: number; mtime: number }[] = [];
        let total = 0;

        for (const name of names) {
            if (name.endsWith('.dl')) continue; // descargas a medias
            try {
                const uri = `${CACHE_DIR}${name}`;
                const info = await FileSystem.getInfoAsync(uri);
                if (info.exists && !info.isDirectory) {
                    entries.push({ uri, size: info.size, mtime: info.modificationTime ?? 0 });
                    total += info.size;
                }
            } catch {
                /* ignorar entrada ilegible */
            }
        }

        if (total <= MAX_CACHE_BYTES) return;

        entries.sort((a, b) => a.mtime - b.mtime); // más viejos primero
        for (const e of entries) {
            if (total <= EVICT_TARGET_BYTES) break;
            try {
                await FileSystem.deleteAsync(e.uri, { idempotent: true });
                total -= e.size;
            } catch {
                /* ignorar */
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
            /* ignorar */
        }

        const res = await FileSystem.downloadAsync(remoteUrl, tmp);
        if (res.status < 200 || res.status >= 300) {
            try {
                await FileSystem.deleteAsync(tmp, { idempotent: true });
            } catch {
                /* ignorar */
            }
            return remoteUrl; // degradar: la URL remota
        }

        const info = await FileSystem.getInfoAsync(tmp);
        if (!info.exists || info.size === 0) {
            try {
                await FileSystem.deleteAsync(tmp, { idempotent: true });
            } catch {
                /* ignorar */
            }
            return remoteUrl;
        }

        // `.dl` -> destino final en un solo paso: nunca queda un archivo a medias
        // con el nombre "bueno".
        await FileSystem.moveAsync({ from: tmp, to: local });
        scheduleEviction();
        return local;
    } catch {
        return remoteUrl; // si falla algo, la URL remota (o null)
    }
}

/**
 * Devuelve un `file://` local para `bucket/path`, descargándolo la primera vez.
 * Si la descarga falla, devuelve la URL remota como fallback; si ni eso, `null`.
 *
 * @param opts.signed  `true` -> firma con `createSignedUrl`; `false` -> `getPublicUrl`.
 * @param opts.ttl     segundos de validez del signed URL (default 3600).
 */
export async function getCachedMedia(
    bucket: string,
    path: string,
    opts: { signed?: boolean; ttl?: number } = {},
): Promise<string | null> {
    if (!path) return null;

    // Si ya nos pasan una URL/archivo resuelto, no hay nada que cachear.
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
            /* sigue al miss */
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
 * Chat E2EE: cachea el TEXTO CIFRADO (nunca el plaintext — eso rompería la
 * propiedad E2EE-at-rest). Devuelve el ciphertext desde disco local o
 * descargándolo y guardándolo.
 *
 * @param opts.persist  `false` -> no escribe a disco (media de una sola vista).
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
                /* sigue al miss */
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
                        /* el ciphertext igual se devuelve desde RAM */
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

/** Borra todo el caché de media en disco (p. ej. al cerrar sesión). */
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
