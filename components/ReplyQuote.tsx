import { vaultCrypto, vaultRAMCache } from "@/utils/crypto";
import { memo, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

interface ReplyQuoteProps {
    content: string;
    senderUsername: string;
    friendPublicKey: string | undefined;
    isMine: boolean;
}

export const ReplyQuote = memo(({ content, senderUsername, friendPublicKey, isMine }: ReplyQuoteProps) => {
    const initialText = vaultRAMCache[content] && !vaultRAMCache[content].startsWith("🔒")
        ? vaultRAMCache[content]
        : "🔒 Decrypting...";

    const [decryptedText, setDecryptedText] = useState(initialText);

    useEffect(() => {
        if (!friendPublicKey) return;

        const cached = vaultRAMCache[content];
        if (cached && !cached.startsWith("🔒")) {
            setDecryptedText(cached);
            return;
        }

        let isMounted = true;
        (async () => {
            try {
                const clearText = await vaultCrypto.decryptMessage(content, friendPublicKey);
                if (isMounted) {
                    if (!clearText.startsWith("🔒")) vaultRAMCache[content] = clearText;
                    setDecryptedText(clearText);
                }
            } catch {
                if (isMounted) setDecryptedText("🔒 One-time photo");
            }
        })();

        return () => { isMounted = false; };
    }, [content, friendPublicKey]);

    return (
        <View style={[styles.quoteBar, isMine ? styles.quoteBarMine : styles.quoteBarTheirs]}>
            <Text style={styles.quoteSender}>{senderUsername}</Text>
            <Text style={styles.quoteText} numberOfLines={1}>{decryptedText}</Text>
        </View>
    );
});

const styles = StyleSheet.create({
    quoteBar: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 4, opacity: 0.75 },
    quoteBarMine: { borderLeftColor: 'rgba(255,255,255,0.6)' },
    quoteBarTheirs: { borderLeftColor: '#DC143C' },
    quoteSender: { color: '#fff', fontSize: 12, fontWeight: '600' },
    quoteText: { color: '#ccc', fontSize: 13 },
});