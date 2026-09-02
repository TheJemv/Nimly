import { supabase } from '@/lib/supabase';
import { vaultCrypto } from '@/utils/crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { useState } from 'react';
import { Alert } from 'react-native';

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
            if (type === 'image' || type === 'image-view-once') {
                try {
                    const manipResult = await ImageManipulator.manipulateAsync(
                        imageUri,
                        [{ resize: { width: 800 } }],
                        { compress: 0.4, format: ImageManipulator.SaveFormat.JPEG }
                    );
                    fileUri = manipResult.uri;
                } catch (manipError) {
                    console.warn("No se pudo comprimir la imagen para E2EE, usando original:", manipError);
                }
            }

            const base64 = await FileSystem.readAsStringAsync(fileUri, {
                encoding: 'base64',
            });

            const encryptedText = await vaultCrypto.encryptMessage(base64, friendPublicKey);
            if (!encryptedText) throw new Error("Encryption failed");

            const fileName = `${chatId}/${Date.now()}.vault`;
            const { error: storageError } = await supabase.storage
                .from('chat-media')
                .upload(fileName, encryptedText, {
                    contentType: 'text/plain;charset=UTF-8',
                    upsert: false
                });

            if (storageError) throw storageError;
            const { data: msgData, error: msgError } = await supabase
                .from('messages')
                .insert({
                    chat_id: chatId,
                    sender_id: currentUserId,
                    content: fileName,
                    type: type
                })
                .select()
                .single();

            if (msgError) throw msgError;
            await supabase.from('messages_media').insert({
                message_id: msgData.id,
                file_path: fileName,
                encryption_key: 'E2EE_ECDH',
                is_view_once: type === 'image-view-once',
                is_viewed: false
            });

            if (__DEV__) console.log(`Vault: ${type} sent (E2EE).`);
        } catch (e) {
            console.error("Media Service Error:", e);
            Alert.alert("Media not sent", "Your photo could not be encrypted and sent. Please try again.");
        } finally {
            setIsUploading(false);
        }
    };

    return { sendCapturedImage, isUploading };
}