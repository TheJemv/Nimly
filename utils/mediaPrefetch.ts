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
        // Same ciphertext cache as the bubble: downloads once, stays on
        // disk and survives restarts. The plaintext only goes to RAM.
        const encryptedText = await getCachedEncryptedText('chat-media', filePath, 60);
        if (!encryptedText) return;

        const base64Data = await vaultCrypto.decryptMessage(encryptedText.trim(), friendPublicKey);

        if (base64Data.startsWith("🔒")) {
          vaultRAMCache[filePath] = 'LOCKED_CAPSULE';
        } else {
          vaultRAMCache[filePath] = `data:image/jpeg;base64,${base64Data}`;
        }
      } catch {
        // if it fails, it's not cached; the individual bubble will retry on its own
      }
    })
  );
}
