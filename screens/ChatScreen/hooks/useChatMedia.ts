import { supabase } from '@/lib/supabase';
import { vaultCrypto } from '@/utils/crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator'; // 👈 1. Importa esto
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

            let fileUri = imageUri;

            // 👈 2. COMPRESIÓN PREVIA (Solo si es imagen): Reduce drásticamente el peso del Base64 resultante
            if (type === 'image' || type === 'image-view-once') {
                try {
                    const manipResult = await ImageManipulator.manipulateAsync(
                        imageUri,
                        [{ resize: { width: 800 } }], // 👈 Bajamos de 1080 a 800 (suficiente para verse perfecto en móvil)
                        { compress: 0.4, format: ImageManipulator.SaveFormat.JPEG } // 👈 Bajamos de 0.7 a 0.4
                    );
                    fileUri = manipResult.uri;
                } catch (manipError) {
                    console.warn("No se pudo comprimir la imagen para E2EE, usando original:", manipError);
                }
            }

            // 3. Convertir la imagen (ya comprimida) a Base64 puro
            const base64 = await FileSystem.readAsStringAsync(fileUri, {
                encoding: 'base64',
            });

            // 4. Cifrado True E2EE (Aquí se cifra el archivo comprimido)
            const encryptedText = await vaultCrypto.encryptMessage(base64, friendPublicKey);
            if (!encryptedText) throw new Error("Encryption failed");

            // 5. SUBIDA DIRECTA Y LIMPIA A SUPABASE
            const fileName = `${chatId}/${Date.now()}.vault`;
            const { error: storageError } = await supabase.storage
                .from('chat-media')
                .upload(fileName, encryptedText, {
                    contentType: 'text/plain;charset=UTF-8', // Sigue siendo texto cifrado seguro
                    upsert: false
                });

            if (storageError) throw storageError;

            // 6. Insertar en la tabla de mensajes
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

            // 7. Insertar los metadatos
            await supabase.from('messages_media').insert({
                message_id: msgData.id,
                file_path: fileName,
                encryption_key: 'E2EE_ECDH',
                is_view_once: type === 'image-view-once',
                is_viewed: false
            });

            console.log(`Vault: ${type} E2EE sent perfectly and lightweight.`);
        } catch (e) {
            console.error("Media Service Error:", e);
        } finally {
            setIsUploading(false);
        }
    };

    return { sendCapturedImage, isUploading };
}