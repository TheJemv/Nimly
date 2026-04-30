import { vaultCrypto } from '@/utils/crypto';
import { useCallback, useState } from 'react';

export function useVaultChat(chatId: string) {
    const [isEncrypting, setIsEncrypting] = useState(false);

    // Encriptar un mensaje saliente
    const encryptMessage = useCallback(async (text: string) => {
        setIsEncrypting(true);
        try {
            const encrypted = await vaultCrypto.encryptMessage(text, chatId);
            return encrypted;
        } finally {
            setIsEncrypting(false);
        }
    }, [chatId]);

    // Desencriptar un mensaje entrante
    const decryptMessage = useCallback(async (cipherText: string) => {
        return await vaultCrypto.decryptMessage(cipherText, chatId);
    }, [chatId]);

    return { encryptMessage, decryptMessage, isEncrypting };
}