import { vaultCrypto, vaultRAMCache } from '@/utils/crypto';
import { getCachedEncryptedText } from '@/utils/mediaCache';

type MediaItem = {
  filePath: string;
  friendPublicKey: string;
};

export async function prefetchChatMedia(items: MediaItem[]) {
  const pending = items.filter(i => !vaultRAMCache[i.filePath]);
  if (pending.length === 0) return;

  await Promise.all(
    pending.map(async ({ filePath, friendPublicKey }) => {
      try {
        // Mismo caché de ciphertext que el bubble: descarga una vez, queda en
        // disco y sobrevive al reinicio. El plaintext solo va a RAM.
        const encryptedText = await getCachedEncryptedText('chat-media', filePath, 60);
        if (!encryptedText) return;

        const base64Data = await vaultCrypto.decryptMessage(encryptedText.trim(), friendPublicKey);

        if (base64Data.startsWith("🔒")) {
          vaultRAMCache[filePath] = 'LOCKED_CAPSULE';
        } else {
          vaultRAMCache[filePath] = `data:image/jpeg;base64,${base64Data}`;
        }
      } catch {
        // si falla, no se cachea; el bubble individual reintentará solo
      }
    })
  );
}
