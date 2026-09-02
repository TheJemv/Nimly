import { vaultCrypto, vaultRAMCache } from "@/utils/crypto";
import React, { memo, useEffect, useState } from "react";
import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

interface MessageContentProps {
    content: string;
    friendPublicKey: string | undefined;
    /** Extra text styling (color / size / etc.) merged over the default. */
    style?: StyleProp<TextStyle>;
    /** Clamp the rendered text to N lines (used by reply previews). */
    numberOfLines?: number;
    /** Fires once we know this packet can't be decrypted on this device. */
    onLocked?: () => void;
}

/** A decrypted string still showing the lock glyph means it never opened. */
const isLockedText = (t: string) => t.startsWith("🔒") && !t.includes("Decrypting");

export const MessageContent = memo(({ content, friendPublicKey, style, numberOfLines, onLocked }: MessageContentProps) => {
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

    useEffect(() => {
        if (isLockedText(decryptedText)) onLocked?.();
    }, [decryptedText, onLocked]);

    return (
        <Text style={[styles.messageText, style]} numberOfLines={numberOfLines}>
            {decryptedText}
        </Text>
    );
});

const styles = StyleSheet.create({
    messageText: { color: '#fff', fontSize: 16 },
});
