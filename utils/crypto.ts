import { supabase } from '@/lib/supabase';
import CryptoJS from 'crypto-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import 'react-native-get-random-values';
import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';

const getSecureRandomWords = (words: number) => {
    const randomBytes = Crypto.getRandomBytes(words * 4);
    const wordArray = [];
    for (let i = 0; i < randomBytes.length; i += 4) {
        wordArray.push(
            (randomBytes[i] << 24) |
            (randomBytes[i + 1] << 16) |
            (randomBytes[i + 2] << 8) |
            randomBytes[i + 3]
        );
    }
    return CryptoJS.lib.WordArray.create(wordArray, words * 4);
};

// --- MOTOR DE IDENTIDAD ASIMÉTRICA (TRUE E2EE) ---

export const vaultIdentity = {
    async generateIdentity() {
        try {
            console.log("Vault: Generating Ed25519 Asymmetric Key Pair...");

            // 1. Generamos el par de llaves matemáticamente vinculadas
            const keyPair = nacl.box.keyPair();

            // 2. Convertimos a Base64 para poder guardarlas
            const privateKey = encodeBase64(keyPair.secretKey);
            const publicKey = encodeBase64(keyPair.publicKey);

            // 3. LA REGLA DE ORO: La Llave Privada se queda en el hardware local.
            await SecureStore.setItemAsync('nymly_private_key', privateKey);

            // 4. La Llave Pública se sube a la base de datos
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await supabase.from('profiles').update({ public_key: publicKey }).eq('id', user.id);
            }

            console.log("Vault: True E2EE Identity established.");
            return publicKey;
        } catch (e: any) {
            console.error("Vault Identity Error:", e.message);
            throw e;
        }
    }
};

// --- CREADOR DE LLAVE COMPARTIDA (DIFFIE-HELLMAN) ---
// Mezcla mi llave privada con la pública de mi amigo para crear una llave única para ambos.
// --- CREADOR DE LLAVE COMPARTIDA BLINDADO ---
const getSharedMasterKey = async (friendPublicKeyBase64: string): Promise<string> => {
    // 1. Firewall: Si no hay llave o es un UUID viejo, abortamos antes de que tweetnacl explote
    if (!friendPublicKeyBase64) {
        throw new Error("No public key provided");
    }
    if (friendPublicKeyBase64.includes('-')) {
        throw new Error("Legacy UUID detected. Not a valid E2EE key.");
    }

    const myPrivateKeyBase64 = await SecureStore.getItemAsync('nymly_private_key');
    if (!myPrivateKeyBase64) {
        throw new Error("Private Key missing. Device compromised or new login.");
    }

    try {
        // 2. Decodificación segura
        const mySecretKey = decodeBase64(myPrivateKeyBase64);
        const friendPublicKey = decodeBase64(friendPublicKeyBase64);

        // 3. Matemática Curve25519
        const sharedKeyBytes = nacl.box.before(friendPublicKey, mySecretKey);
        return encodeBase64(sharedKeyBytes);
    } catch (error) {
        // Si la codificación sigue siendo inválida, lo atrapamos aquí
        throw new Error("Base64 decoding failed. Corrupted keys.");
    }
};

// --- MOTOR DE CRIPTOGRAFÍA ---

export const vaultCrypto = {
    async encryptMessage(plainText: string, friendPublicKey: string): Promise<string | null> {
        try {
            if (!friendPublicKey) throw new Error("Missing recipient public key");

            // Obtenemos la llave simétrica compartida mediante ECDH
            const sharedMasterKey = await getSharedMasterKey(friendPublicKey);
            const derivedKey = CryptoJS.SHA256(sharedMasterKey);

            const iv = getSecureRandomWords(128 / 32);
            const salt = getSecureRandomWords(128 / 32);

            const encrypted = CryptoJS.AES.encrypt(plainText, derivedKey, {
                iv: iv,
                salt: salt,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            });

            return salt.toString() + ":" + iv.toString() + ":" + encrypted.ciphertext.toString();
        } catch (e: any) {
            console.error("Encryption Error:", e.message);
            return null;
        }
    },

    async encryptFile(base64Data: string, friendPublicKey: string): Promise<string | null> {
        try {
            const sharedMasterKey = await getSharedMasterKey(friendPublicKey);
            const derivedKey = CryptoJS.SHA256(sharedMasterKey);

            const iv = getSecureRandomWords(128 / 32);
            const salt = getSecureRandomWords(128 / 32);

            const encrypted = CryptoJS.AES.encrypt(base64Data, derivedKey, {
                iv: iv,
                salt: salt,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            });

            return salt.toString() + ":" + iv.toString() + ":" + encrypted.ciphertext.toString();
        } catch (e: any) {
            return null;
        }
    },

    async decryptMessage(packet: string, friendPublicKey: string): Promise<string> {
        try {
            const parts = packet.split(':');
            if (parts.length !== 3) return packet;

            const salt = CryptoJS.enc.Hex.parse(parts[0]);
            const iv = CryptoJS.enc.Hex.parse(parts[1]);
            const ciphertext = CryptoJS.enc.Hex.parse(parts[2]);

            // Derivamos la llave para abrir el candado usando la pública del amigo
            const sharedMasterKey = await getSharedMasterKey(friendPublicKey);
            const derivedKey = CryptoJS.SHA256(sharedMasterKey);

            const cipherParams = CryptoJS.lib.CipherParams.create({
                ciphertext: ciphertext,
                salt: salt,
                iv: iv
            });

            const bytes = CryptoJS.AES.decrypt(cipherParams as any, derivedKey, {
                iv: iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            });

            const originalText = bytes.toString(CryptoJS.enc.Utf8);
            if (!originalText) throw new Error("Malformed data");

            return originalText;
        } catch (e) {
            return "🔒 Locked Capsule";
        }
    }
};

// --- CONTROL DE MEMORIA RAM (CACHÉ) ---
export const vaultRAMCache: { [key: string]: string } = {};

export const purgeVaultRAM = () => {
    console.log("Vault: Purging RAM cache...");
    Object.keys(vaultRAMCache).forEach(key => delete vaultRAMCache[key]);
};