import { supabase } from '@/lib/supabase';
import { vaultCrypto } from '@/utils/crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { useState } from 'react';

export function useChatMedia(chatId: string, currentUserId: string) {
    const [isUploading, setIsUploading] = useState(false);

    const sendCapturedImage = async (imageUri: string, type: 'image' | 'video' | 'image-view-once', friendPublicKey: string) => {
        if (!chatId || !currentUserId || !friendPublicKey) {
            console.error("Missing required data for E2EE media upload");
            return;
        }

        try {
            setIsUploading(true);

            // 1. Convertir a Base64 puro
            const base64 = await FileSystem.readAsStringAsync(imageUri, {
                encoding: 'base64',
            });

            // 2. Cifrado True E2EE
            const encryptedText = await vaultCrypto.encryptMessage(base64, friendPublicKey);
            if (!encryptedText) throw new Error("Encryption failed");

            // 3. SUBIDA DIRECTA Y LIMPIA (Sin FormData)
            const fileName = `${chatId}/${Date.now()}.vault`;
            const { error: storageError } = await supabase.storage
                .from('chat-media')
                .upload(fileName, encryptedText, {
                    contentType: 'text/plain;charset=UTF-8', // Le decimos a Supabase que es texto puro
                    upsert: false
                });

            if (storageError) throw storageError;

            // 4. Insertar en la tabla de mensajes
            const { data: msgData, error: msgError } = await supabase
                .from('messages')
                .insert({
                    chat_id: chatId,
                    sender_id: currentUserId,
                    content: fileName,
                    type: type // 'image', 'video' o 'image-view-once'
                })
                .select()
                .single();

            if (msgError) throw msgError;

            // 5. Insertar los metadatos
            await supabase.from('messages_media').insert({
                message_id: msgData.id,
                file_path: fileName,
                encryption_key: 'E2EE_ECDH',
                is_view_once: type === 'image-view-once',
                is_viewed: false
            });

            console.log(`Vault: ${type} E2EE sent perfectly without boundaries.`);
        } catch (e) {
            console.error("Media Service Error:", e);
        } finally {
            setIsUploading(false);
        }
    };

    return { sendCapturedImage, isUploading };
}