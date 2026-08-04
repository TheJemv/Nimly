import { supabase } from "@/lib/supabase";
import { decode } from 'base64-arraybuffer';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

export const chatApi = {
    async getOrCreateChat(targetId: string) {
        if (!targetId || targetId === 'undefined') {
            console.error("Target ID is invalid:", targetId);
            return null;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("User not authenticated");

        // Buscar chat compartido
        const { data: myChats } = await supabase
            .from('chat_participants')
            .select('chat_id')
            .eq('user_id', user.id);

        const myIds = myChats?.map(c => c.chat_id) || [];

        const { data: common } = await supabase
            .from('chat_participants')
            .select('chat_id')
            .eq('user_id', targetId)
            .in('chat_id', myIds)
            .maybeSingle();

        if (common) return common.chat_id;

        // Crear nuevo chat
        const { data: newChat, error: e1 } = await supabase.from('chats').insert({}).select().single();
        if (e1) throw e1;

        const { error: e2 } = await supabase.from('chat_participants').insert([
            { chat_id: newChat.id, user_id: user.id },
            { chat_id: newChat.id, user_id: targetId }
        ]);
        if (e2) throw e2;

        return newChat.id;
    },

    async sendMessage(chatId: string, content: string) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("No auth");

        const { error } = await supabase
            .from('messages')
            .insert([{ chat_id: chatId, sender_id: user.id, content }]);

        if (error) throw error;
    },

    async getMessages(chatId: string) {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
    },

    async sendViewOncePhoto(chatId: string, imageUri: string) {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No session");

            // 1. Generar Llave AES efímera para esta foto
            const encryptionKey = await Crypto.digestStringAsync(
                Crypto.CryptoDigestAlgorithm.SHA256,
                `nymly-secret-${Date.now()}-${Math.random()}`
            );

            // 2. Leer archivo en base64 (Método Legacy)
            const base64 = await FileSystem.readAsStringAsync(imageUri, {
                encoding: 'base64',
            });

            const ext = imageUri.split('.').pop() || 'jpg';
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.enc`;
            const filePath = `${chatId}/${fileName}`;

            // 3. Subir al bucket 'messages_media'
            const { data: uploadData, error: upError } = await supabase.storage
                .from('messages_media')
                .upload(filePath, decode(base64), {
                    contentType: 'application/octet-stream', // Subimos como binario encriptado
                    upsert: false
                });

            if (upError) throw upError;

            // 4. Crear el mensaje base
            const { data: msg, error: msgError } = await supabase
                .from('messages')
                .insert({
                    chat_id: chatId,
                    sender_id: user.id,
                    type: 'media',
                    content: '🔒 View-once vault entry'
                })
                .select()
                .single();

            if (msgError) throw msgError;

            // 5. Vincular media y llave
            await supabase.from('messages_media').insert({
                message_id: msg.id,
                file_path: uploadData.path,
                encryption_key: encryptionKey,
                is_view_once: true
            });

            return { success: true, messageId: msg.id };

        } catch (error) {
            console.error("Vault Media Error:", error);
            throw error;
        }
    },

    /**
     * PURGE: Elimina físicamente la foto y el mensaje de la bóveda.
     */
    async burnMedia(messageId: string, filePath: string) {
        try {
            await supabase.storage.from('messages_media').remove([filePath]);
            await supabase.from('messages').delete().eq('id', messageId);
        } catch (error) {
            console.error("Failed to burn media:", error);
        }
    },

    /**
     * BURN HISTORY: Elimina todos los mensajes y archivos de un chat específico,
     * pero mantiene el chat abierto.
     */
    async burnChatHistory(chatId: string) {
        try {
            // 1. Obtener todos los mensajes para saber cuáles son fotos
            const { data: messages } = await supabase
                .from('messages')
                .select('id, content, type')
                .eq('chat_id', chatId);

            if (!messages || messages.length === 0) return { success: true };

            // 2. Filtrar los que son imágenes para borrar sus archivos físicos del Storage
            const mediaFiles = messages
                .filter(m => m.type === 'image' || m.type === 'image-view-once')
                .map(m => m.content); // En content guardamos la ruta: "chat_id/123.vault"

            if (mediaFiles.length > 0) {
                console.log(`Vault: Burning ${mediaFiles.length} physical files...`);
                await supabase.storage.from('chat-media').remove(mediaFiles);
            }

            // 3. Extraer los IDs para destruir dependencias
            const messageIds = messages.map(m => m.id);

            // 4. Borrar los metadatos de las fotos (para evitar error de Foreign Key)
            await supabase.from('messages_media').delete().in('message_id', messageIds);

            // 5. Destrucción final: Borrar los mensajes de la tabla principal
            const { error } = await supabase.from('messages').delete().eq('chat_id', chatId);

            if (error) throw error;

            console.log("Vault: Chat history completely burned.");
            return { success: true };
        } catch (error) {
            console.error("Failed to burn chat history:", error);
            throw error;
        }
    },

    // Agrega esto dentro del objeto chatApi en tu archivo
    async markAsRead(chatId: string, senderId: string) {
        if (!chatId || !senderId) return null;
        try {
            const { data, error } = await supabase
                .from('messages')
                .update({ is_read: true })
                .eq('chat_id', chatId)
                .eq('sender_id', senderId)
                .eq('is_read', false);

            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error("❌ [API_READ] Error en la bóveda al marcar lectura:", error);
            return { success: false, error };
        }
    },
};