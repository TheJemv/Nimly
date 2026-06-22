import { supabase } from '@/lib/supabase';
import { vaultCrypto, vaultRAMCache } from '@/utils/crypto';

type MediaItem = {
  filePath: string;
  friendPublicKey: string;
};

export async function prefetchChatMedia(items: MediaItem[]) {
  const pending = items.filter(i => !vaultRAMCache[i.filePath]);
  if (pending.length === 0) return;

  const paths = pending.map(i => i.filePath);

  const { data, error } = await supabase.storage
    .from('chat-media')
    .createSignedUrls(paths, 60);

  if (error || !data) return;

  await Promise.all(
    data.map(async (signed, index) => {
      if (!signed.signedUrl) return;
      const { filePath, friendPublicKey } = pending[index];

      try {
        const res = await fetch(signed.signedUrl);
        const encryptedText = await res.text();
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