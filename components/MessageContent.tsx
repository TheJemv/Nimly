import { vaultCrypto, vaultRAMCache } from "@/utils/crypto";
import React, { memo, useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";

interface MessageContentProps {
    content: string;
    friendPublicKey: string | undefined;
}

export const MessageContent = memo(({ content, friendPublicKey }: MessageContentProps) => {
    const initialText = vaultRAMCache[content] && !vaultRAMCache[content].startsWith("🔒")
        ? vaultRAMCache[content]
        : "🔒 Decrypting...";

    const [decryptedText, setDecryptedText] = useState(initialText);

    useEffect(() => {
        if (!friendPublicKey) {
            setDecryptedText("🔒 Decrypting…");
            return;
        }

        const cached = vaultRAMCache[content];
        if (cached && !cached.startsWith("🔒")) {
            setDecryptedText(cached); // 👈 antes solo hacía "return"
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
            } catch {
                if (isMounted) setDecryptedText("🔒 One-time photo");
            }
        };

        decrypt();
        return () => { isMounted = false; };
    }, [content, friendPublicKey]);

    return <Text style={styles.messageText}>{decryptedText}</Text>;
});

const styles = StyleSheet.create({
    messageText: { color: '#fff', fontSize: 16 },
});