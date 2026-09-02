import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import 'react-native-get-random-values';
import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';

import crypto, { Buffer } from 'react-native-quick-crypto';

// --- MOTOR DE IDENTIDAD ASIMÉTRICA (TRUE E2EE) ---
//
// La llave privada vive ÚNICAMENTE en el Keychain del dispositivo. No hay
// respaldo: si se pierde (reinstalación / dispositivo nuevo), se crea una
// identidad nueva y el historial cifrado anterior queda ilegible. La app pide
// confirmación explícita antes de hacerlo (nunca en silencio).

export const PRIVATE_KEY_STORE = 'nymly_private_key';
export const OWNER_ID_STORE = 'nymly_user_id';

export type VaultIdentityState = 'ready' | 'needs_new_identity' | 'needs_setup';

/** Fingerprint corto y legible de una public key (SHA-256 → 16 hex, en grupos). */
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
 * Sube `public_key` (+ `public_key_updated_at` si la columna existe).
 * Si esa columna aún no está en la BD, reintenta solo con `public_key`.
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
     * Crea una identidad E2EE NUEVA (par de llaves Curve25519). Guarda la privada
     * en el Keychain local y publica solo la pública.
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
     *  - 'ready'             → hay llave privada local válida para el usuario actual.
     *  - 'needs_new_identity'→ el servidor ya tiene una identidad tuya pero este
     *                          dispositivo no (reinstalación / dispositivo nuevo).
     *                          Requiere confirmación explícita para regenerar.
     *  - 'needs_setup'       → nunca hubo identidad. Se genera directamente.
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
     * Elección EXPLÍCITA del usuario en un dispositivo sin llaves: descarta el
     * historial cifrado anterior y crea una identidad nueva.
     */
    async createFreshIdentity(): Promise<void> {
        await SecureStore.deleteItemAsync(PRIVATE_KEY_STORE);
        await vaultIdentity.generateIdentity();
    },
};

// --- SEGUIMIENTO LOCAL DE LLAVES DE CONTACTOS (a prueba de manipulación del server) ---
//
// Cada dispositivo recuerda la última public key vista de cada contacto para
// poder avisar si cambia (equivalente al "safety number changed" de Signal).
// Son llaves PÚBLICAS → AsyncStorage es suficiente.

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
    /** Registra la public key actual de un contacto. Devuelve si cambió respecto
     *  a la última conocida en ESTE dispositivo. */
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
        } catch { /* no crítico */ }

        return {
            changed: Boolean(prev), // solo "cambió" si ya conocíamos una anterior
            previousKey: prev?.key ?? null,
            firstSeenAt: nowIso,
        };
    },

    async get(userId: string): Promise<KnownKeyRecord | null> {
        const all = await readKnownKeys();
        return all[userId] ?? null;
    },
};

// --- CREADOR DE LLAVE COMPARTIDA (DIFFIE-HELLMAN) ---
// Mezcla mi llave privada con la pública de mi amigo para crear el secreto ECDH
// (Curve25519) que solo ambos pueden calcular.
const getSharedSecret = async (friendPublicKeyBase64: string): Promise<Uint8Array> => {
    if (!friendPublicKeyBase64) {
        throw new Error("No public key provided");
    }
    // Una llave E2EE es base64 de 32 bytes (~44 chars). Un UUID legacy trae guiones.
    if (friendPublicKeyBase64.includes('-')) {
        throw new Error("Legacy UUID detected. Not a valid E2EE key.");
    }

    const myPrivateKeyBase64 = await SecureStore.getItemAsync(PRIVATE_KEY_STORE);
    if (!myPrivateKeyBase64) {
        throw new Error("Private Key missing. Device compromised or new login.");
    }

    try {
        const mySecretKey = decodeBase64(myPrivateKeyBase64);
        const friendPublicKey = decodeBase64(friendPublicKeyBase64);
        return nacl.box.before(friendPublicKey, mySecretKey); // 32 bytes
    } catch {
        throw new Error("Base64 decoding failed. Corrupted keys.");
    }
};

// --- MOTOR DE CRIPTOGRAFÍA ---
//
// Formato v2 (actual): AES-256-GCM con integridad + HKDF-SHA256(secreto, salt).
//   packet = "v2:<salt>:<iv>:<tag>:<ciphertext>"  (todo hex)
// Formato legacy (solo lectura): AES-256-CBC sin autenticación, llave = SHA256(base64(secreto)).
//   packet = "<salt>:<iv>:<ciphertext>"  (el salt nunca se usaba)

const HKDF_INFO = Buffer.from('nimly/vault/message/v2', 'utf8');

const deriveMessageKey = (sharedSecret: Uint8Array, salt: Buffer): Buffer =>
    crypto.hkdfSync('sha256', Buffer.from(sharedSecret), salt, HKDF_INFO, 32) as unknown as Buffer;

const encryptV2 = (plainText: string, sharedSecret: Uint8Array): string => {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12); // GCM: nonce de 96 bits
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
    decipher.setAuthTag(Buffer.from(tagHex, 'hex')); // falla si el mensaje fue manipulado

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

            return packet; // texto plano por error de un cliente antiguo
        } catch {
            return "🔒 Locked Capsule";
        }
    }
};

// --- CONTROL DE MEMORIA RAM (CACHÉ) ---
//
// Caché en memoria de mensajes/medios ya descifrados. Se accede como un objeto
// normal (`vaultRAMCache[key]`), pero un Proxy limita el nº de entradas para que
// no crezca sin control (los data URIs de imágenes pesan). Al superar el tope se
// descarta la entrada más antigua (FIFO por orden de inserción).
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