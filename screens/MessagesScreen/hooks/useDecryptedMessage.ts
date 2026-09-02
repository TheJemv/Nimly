import { vaultCrypto, vaultRAMCache } from "@/utils/crypto";
import { useEffect, useState } from "react";

export type DecryptStatus = "ok" | "pending" | "failed";

const DECRYPTING = "🔒 Decrypting…";

const statusOf = (t: string): DecryptStatus => {
    if (!t.startsWith("🔒")) return "ok";
    return t.includes("Decrypting") ? "pending" : "failed";
};

/**
 * Decrypts a chat-list preview. Returns `{ text, status }` so the caller can
 * show a clean fallback instead of leaking sentinels like "🔒 One-time photo".
 */
export function useDecryptedMessage(content: string, friendPublicKey?: string): { text: string; status: DecryptStatus } {
    const cached = vaultRAMCache[content];
    const initialText = cached && !cached.startsWith("🔒") ? cached : DECRYPTING;

    const [text, setText] = useState(initialText);

    useEffect(() => {
        if (!content) {
            setText("");
            return;
        }
        if (!friendPublicKey) {
            setText(DECRYPTING);
            return;
        }

        const hit = vaultRAMCache[content];
        if (hit && !hit.startsWith("🔒")) {
            setText(hit);
            return;
        }

        let alive = true;
        (async () => {
            try {
                const clear = await vaultCrypto.decryptMessage(content, friendPublicKey);
                if (!alive) return;
                if (!clear.startsWith("🔒")) vaultRAMCache[content] = clear;
                setText(clear);
            } catch {
                if (alive) setText("🔒");
            }
        })();

        return () => { alive = false; };
    }, [content, friendPublicKey]);

    return { text, status: statusOf(text) };
}
