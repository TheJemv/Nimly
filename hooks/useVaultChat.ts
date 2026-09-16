import { vaultCrypto } from '@/utils/crypto';
import { useCallback, useState } from 'react';

export function useVaultChat(chatId: string) {
    const [isEncrypting, setIsEncrypting] = useState(false);

    // Encrypt an outgoing message
    const encryptMessage = useCallback(async (text: string) => {
        setIsEncrypting(true);
        try {
            const encrypted = await vaultCrypto.encryptMessage(text, chatId);
            return encrypted;
        } finally {
            setIsEncrypting(false);
        }
    }, [chatId]);

    // Decrypt an incoming message
    const decryptMessage = useCallback(async (cipherText: string) => {
        return await vaultCrypto.decryptMessage(cipherText, chatId);
    }, [chatId]);

    return { encryptMessage, decryptMessage, isEncrypting };
}