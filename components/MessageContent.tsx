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
            setDecryptedText("🔒 Connecting Vault...");
            return;
        }

        if (vaultRAMCache[content] && !vaultRAMCache[content].startsWith("🔒")) return;

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
                if (isMounted) setDecryptedText("🔒 Locked Capsule");
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