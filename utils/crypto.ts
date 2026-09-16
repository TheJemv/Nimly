import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import 'react-native-get-random-values';
import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';

import crypto, { Buffer } from 'react-native-quick-crypto';

// --- ASYMMETRIC IDENTITY ENGINE (TRUE E2EE) ---
//
// The private key lives ONLY in the device's Keychain. There is no
// backup: if it's lost (reinstall / new device), a new identity is
// created and the previous encrypted history becomes unreadable. The app asks
// for explicit confirmation before doing this (never silently).

export const PRIVATE_KEY_STORE = 'nymly_private_key';
export const OWNER_ID_STORE = 'nymly_user_id';

export type VaultIdentityState = 'ready' | 'needs_new_identity' | 'needs_setup';

/** Short, human-readable fingerprint of a public key (SHA-256 → 16 hex chars, grouped). */
export const keyFingerprint = (publicKeyBase64: string | null | undefined): string => {
    if (!publicKeyBase64) return '—';
    try {
        const hash = crypto.createHash('sha256').update(publicKeyBase64).digest('hex') as string;
        return (hash.slice(0, 16).toUpperCase().match(/.{1,4}/g) || []).join(' ');
    } catch {
        return '—';
    }
};

const getOwnProfilePublicKey = async (): Promise<{ userId: string; publicKey: string | null } | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
        .from('profiles')
        .select('public_key')
        .eq('id', user.id)
        .single();
    return { userId: user.id, publicKey: data?.public_key ?? null };
};

/**
 * Uploads `public_key` (+ `public_key_updated_at` if the column exists).
 * If that column isn't in the DB yet, retries with just `public_key`.
 */
const publishPublicKey = async (userId: string, publicKey: string): Promise<void> => {
    const withTs = await supabase
        .from('profiles')
        .update({ public_key: publicKey, public_key_updated_at: new Date().toISOString() })
        .eq('id', userId);
    if (!withTs.error) return;

    const retry = await supabase.from('profiles').update({ public_key: publicKey }).eq('id', userId);
    if (retry.error) throw retry.error;
    console.warn("Vault: 'public_key_updated_at' column missing — stored public key only.");
};

export const vaultIdentity = {
    /**
     * Creates a NEW E2EE identity (Curve25519 key pair). Stores the private key
     * in the local Keychain and publishes only the public key.
     */
    async generateIdentity(): Promise<string> {
        try {
            const keyPair = nacl.box.keyPair();
            const privateKey = encodeBase64(keyPair.secretKey);
            const publicKey = encodeBase64(keyPair.publicKey);

            await SecureStore.setItemAsync(PRIVATE_KEY_STORE, privateKey);

            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await SecureStore.setItemAsync(OWNER_ID_STORE, user.id);
                await publishPublicKey(user.id, publicKey);
            }
            return publicKey;
        } catch (e: any) {
            console.error("Vault Identity Error:", e?.message || e);
            throw e;
        }
    },

    /**
     *  - 'ready'              → there's a valid local private key for the current user.
     *  - 'needs_new_identity' → the server already has an identity of yours but this
     *                           device doesn't (reinstall / new device).
     *                           Requires explicit confirmation to regenerate.
     *  - 'needs_setup'        → there was never an identity. It's generated directly.
     */
    async getIdentityState(): Promise<VaultIdentityState> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return 'needs_setup';

        const localPriv = await SecureStore.getItemAsync(PRIVATE_KEY_STORE);
        const owner = await SecureStore.getItemAsync(OWNER_ID_STORE);
        if (localPriv && owner === user.id) return 'ready';

        const keys = await getOwnProfilePublicKey();
        return keys?.publicKey ? 'needs_new_identity' : 'needs_setup';
    },

    /**
     * EXPLICIT user choice on a device with no keys: discards the previous
     * encrypted history and creates a new identity.
     */
    async createFreshIdentity(): Promise<void> {
        await SecureStore.deleteItemAsync(PRIVATE_KEY_STORE);
        await vaultIdentity.generateIdentity();
        await identityRotation.markRotated();
    },
};

// --- LOCAL TRACKING OF CONTACT KEYS (tamper-proof against server manipulation) ---
//
// Each device remembers the last public key seen for each contact so it can
// warn if it changes (equivalent to Signal's "safety number changed").
// These are PUBLIC keys → AsyncStorage is sufficient.

const KNOWN_KEYS_STORE = 'nimly_known_pubkeys';

type KnownKeyRecord = { key: string; firstSeenAt: string };

const readKnownKeys = async (): Promise<Record<string, KnownKeyRecord>> => {
    try {
        const raw = await AsyncStorage.getItem(KNOWN_KEYS_STORE);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
};

export const contactKeys = {
    /** Records a contact's current public key. Returns whether it changed relative
     *  to the last one known on THIS device. */
    async record(userId: string, publicKey: string | null): Promise<{
        changed: boolean;
        previousKey: string | null;
        firstSeenAt: string;
    }> {
        const nowIso = new Date().toISOString();
        if (!userId || !publicKey) return { changed: false, previousKey: null, firstSeenAt: nowIso };

        const all = await readKnownKeys();
        const prev = all[userId] ?? null;

        if (prev && prev.key === publicKey) {
            return { changed: false, previousKey: prev.key, firstSeenAt: prev.firstSeenAt };
        }

        all[userId] = { key: publicKey, firstSeenAt: nowIso };
        try {
            await AsyncStorage.setItem(KNOWN_KEYS_STORE, JSON.stringify(all));
        } catch { /* not critical */ }

        return {
            changed: Boolean(prev), // only "changed" if we already knew a previous one
            previousKey: prev?.key ?? null,
            firstSeenAt: nowIso,
        };
    },

    async get(userId: string): Promise<KnownKeyRecord | null> {
        const all = await readKnownKeys();
        return all[userId] ?? null;
    },
};

// --- TIMESTAMP OF WHEN MY IDENTITY WAS ROTATED ON THIS DEVICE ---
//
// After an identity change (new device / "force takeover"), the previous
// private key disappears: nothing encrypted BEFORE this instant can be
// decrypted here. Chat uses this marker to avoid even requesting those messages.

const IDENTITY_ROTATED_STORE = 'nimly_identity_rotated_at';

export const identityRotation = {
    async markRotated(): Promise<void> {
        try { await AsyncStorage.setItem(IDENTITY_ROTATED_STORE, new Date().toISOString()); } catch { /* not critical */ }
    },
    async rotatedAt(): Promise<string | null> {
        try { return await AsyncStorage.getItem(IDENTITY_ROTATED_STORE); } catch { return null; }
    },
    async clear(): Promise<void> {
        try { await AsyncStorage.removeItem(IDENTITY_ROTATED_STORE); } catch { /* not critical */ }
    },
};

// --- SHARED KEY CREATOR (DIFFIE-HELLMAN) ---
// Mixes my private key with my friend's public key to create the ECDH secret
// (Curve25519) that only both of us can compute.
//
// The per-contact secret is ALWAYS the same, so we cache it: recomputing
// `nacl.box.before` (~1-2 ms JS) + reading SecureStore from disk for every
// message made decrypting a whole page cause the scroll to stutter.
const sharedSecretCache = new Map<string, Uint8Array>();

/** Clears the ECDH secret cache (on logout / identity rotation). */
export const purgeSharedSecrets = () => sharedSecretCache.clear();

const getSharedSecret = async (friendPublicKeyBase64: string): Promise<Uint8Array> => {
    if (!friendPublicKeyBase64) {
        throw new Error("No public key provided");
    }
    // An E2EE key is base64 of 32 bytes (~44 chars). A legacy UUID has dashes.
    if (friendPublicKeyBase64.includes('-')) {
        throw new Error("Legacy UUID detected. Not a valid E2EE key.");
    }

    const cached = sharedSecretCache.get(friendPublicKeyBase64);
    if (cached) return cached;

    const myPrivateKeyBase64 = await SecureStore.getItemAsync(PRIVATE_KEY_STORE);
    if (!myPrivateKeyBase64) {
        throw new Error("Private Key missing. Device compromised or new login.");
    }

    try {
        const mySecretKey = decodeBase64(myPrivateKeyBase64);
        const friendPublicKey = decodeBase64(friendPublicKeyBase64);
        const secret = nacl.box.before(friendPublicKey, mySecretKey); // 32 bytes
        sharedSecretCache.set(friendPublicKeyBase64, secret);
        return secret;
    } catch {
        throw new Error("Base64 decoding failed. Corrupted keys.");
    }
};

// --- CRYPTOGRAPHY ENGINE ---
//
// Format v2 (current): AES-256-GCM with integrity + HKDF-SHA256(secret, salt).
//   packet = "v2:<salt>:<iv>:<tag>:<ciphertext>"  (all hex)
// Legacy format (read-only): AES-256-CBC without authentication, key = SHA256(base64(secret)).
//   packet = "<salt>:<iv>:<ciphertext>"  (the salt was never actually used)

const HKDF_INFO = Buffer.from('nimly/vault/message/v2', 'utf8');

const deriveMessageKey = (sharedSecret: Uint8Array, salt: Buffer): Buffer =>
    crypto.hkdfSync('sha256', Buffer.from(sharedSecret), salt, HKDF_INFO, 32) as unknown as Buffer;

const encryptV2 = (plainText: string, sharedSecret: Uint8Array): string => {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12); // GCM: 96-bit nonce
    const key = deriveMessageKey(sharedSecret, salt);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let ct = cipher.update(plainText, 'utf8', 'hex');
    ct += cipher.final('hex');
    const tag = cipher.getAuthTag();

    return `v2:${salt.toString('hex')}:${iv.toString('hex')}:${tag.toString('hex')}:${ct}`;
};

const decryptV2 = (packet: string, sharedSecret: Uint8Array): string => {
    const [, saltHex, ivHex, tagHex, ct] = packet.split(':');
    if (!saltHex || !ivHex || !tagHex || ct == null) throw new Error("Malformed v2 packet");

    const key = deriveMessageKey(sharedSecret, Buffer.from(saltHex, 'hex'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex')); // fails if the message was tampered with

    let pt = decipher.update(ct, 'hex', 'utf8');
    pt += decipher.final('utf8');
    return pt;
};

const decryptLegacyCbc = (packet: string, sharedSecret: Uint8Array): string => {
    const parts = packet.split(':');
    const ivHex = parts[1];
    const ciphertextHex = parts[2];

    const derivedKey = crypto.createHash('sha256').update(encodeBase64(sharedSecret)).digest();
    const decipher = crypto.createDecipheriv('aes-256-cbc', derivedKey, Buffer.from(ivHex, 'hex'));

    let decryptedText = decipher.update(ciphertextHex, 'hex', 'utf8');
    decryptedText += decipher.final('utf8');
    if (!decryptedText) throw new Error("Malformed data");
    return decryptedText;
};

export const vaultCrypto = {
    async encryptMessage(plainText: string, friendPublicKey: string): Promise<string | null> {
        try {
            if (!friendPublicKey) throw new Error("Missing recipient public key");
            const secret = await getSharedSecret(friendPublicKey);
            return encryptV2(plainText, secret);
        } catch (e: any) {
            console.error("Encryption Error:", e?.message || e);
            return null;
        }
    },

    async encryptFile(base64Data: string, friendPublicKey: string): Promise<string | null> {
        try {
            const secret = await getSharedSecret(friendPublicKey);
            return encryptV2(base64Data, secret);
        } catch (e: any) {
            console.error("File Encryption Error:", e?.message || e);
            return null;
        }
    },

    async decryptMessage(packet: string, friendPublicKey: string): Promise<string> {
        try {
            if (!packet) return packet;
            const secret = await getSharedSecret(friendPublicKey);

            if (packet.startsWith('v2:')) return decryptV2(packet, secret);
            if (packet.split(':').length === 3) return decryptLegacyCbc(packet, secret);

            return packet; // plaintext due to an old client bug
        } catch {
            return "🔒 One-time photo";
        }
    }
};

// --- RAM MEMORY CONTROL (CACHE) ---
//
// In-memory cache of already-decrypted messages/media. Accessed like a
// normal object (`vaultRAMCache[key]`), but a Proxy caps the number of entries
// so it doesn't grow unbounded (image data URIs are heavy). Once the cap is
// exceeded, the oldest entry is evicted (FIFO by insertion order).
const MAX_CACHE_ENTRIES = 120;
const rawVaultCache: { [key: string]: string } = {};

export const vaultRAMCache: { [key: string]: string } = new Proxy(rawVaultCache, {
    set(target, prop: string, value: string) {
        if (!(prop in target) && Object.keys(target).length >= MAX_CACHE_ENTRIES) {
            const oldest = Object.keys(target)[0];
            if (oldest !== undefined) delete target[oldest];
        }
        target[prop] = value;
        return true;
    },
});

export const purgeVaultRAM = () => {
    Object.keys(rawVaultCache).forEach(key => delete rawVaultCache[key]);
};