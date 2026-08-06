import { vaultCrypto, vaultRAMCache } from "@/utils/crypto";
import { useEffect, useState } from "react";

export function useDecryptedMessage(content: string, friendPublicKey?: string) {
    const initialText = vaultRAMCache[content] && !vaultRAMCache[content].startsWith("🔒")
        ? vaultRAMCache[content]
        : "🔒 Decrypting...";

    const [decryptedText, setDecryptedText] = useState(initialText);

    useEffect(() => {
        if (!friendPublicKey) {
            setDecryptedText("🔒 Syncing Vault...");
            return;
        }

        const cached = vaultRAMCache[content];
        if (cached && !cached.startsWith("🔒")) {
            setDecryptedText(cached); // 👈 antes solo hacía "return", ahora sí actualiza
            return;
        }

        let isMounted = true;
        const decrypt = async () => {
            try {
                const clearText = await vaultCrypto.decryptMessage(content, friendPublicKey);
                if (isMounted) {
                    if (!clearText.startsWith("🔒")) {
                        vaultRAMCache[content] = clearText;
                    }
                    setDecryptedText(clearText);
                }
            } catch (e) {
                if (isMounted) setDecryptedText("🔒 Error");
            }
        };
        decrypt();

        return () => { isMounted = false; };
    }, [content, friendPublicKey]);

    return decryptedText;
}