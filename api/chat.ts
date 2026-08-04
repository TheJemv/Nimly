import { supabase } from "@/lib/supabase";

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
            .insert([{ chat_id: chatId, sender_id: user.id, content, type: 'text' }]);

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

    /**
     * PURGE: Elimina físicamente el archivo .vault de la bóveda y el mensaje de la base de datos.
     */
    async burnMedia(messageId: string, filePath: string) {
        try {
            await supabase.storage.from('chat-media').remove([filePath]);
            await supabase.from('messages').delete().eq('id', messageId);
        } catch (error) {
            console.error("Failed to burn media:", error);
        }
    },

    /**
     * BURN HISTORY: Elimina todos los mensajes y archivos .vault de un chat específico,
     * manteniendo la sala de chat abierta.
     */
/**
     * BURN HISTORY: Elimina todos los mensajes y archivos .vault de un chat específico.
     */
    async burnChatHistory(chatId: string) {
        try {
            // 1. Obtener todos los mensajes para identificar cuáles son multimedia
            const { data: messages, error: fetchError } = await supabase
                .from('messages')
                .select('id, content, type')
                .eq('chat_id', chatId);

            if (fetchError) throw fetchError;
            if (!messages || messages.length === 0) return { success: true };

            // 2. Filtrar y borrar archivos físicos del Storage
            const mediaFiles = messages
                .filter(m => m.type === 'image' || m.type === 'video' || m.type === 'image-view-once')
                .map(m => m.content);

            if (mediaFiles.length > 0) {
                console.log(`Vault: Burning ${mediaFiles.length} physical files...`);
                const { error: storageError } = await supabase.storage.from('chat-media').remove(mediaFiles);
                if (storageError) console.error("⚠️ Aviso: Algunos archivos no se borraron del storage:", storageError);
            }

            const messageIds = messages.map(m => m.id);

            // 3. Destruir metadatos (Revisión estricta de errores)
            const { error: mediaError } = await supabase
                .from('messages_media')
                .delete()
                .in('message_id', messageIds);

            if (mediaError) {
                console.error("❌ Error DB al borrar messages_media (¿Restricción de llave foránea?):", mediaError);
                throw mediaError;
            }

            // 4. Destrucción final de los textos (Revisión estricta de errores)
            const { error: msgError } = await supabase
                .from('messages')
                .delete()
                .eq('chat_id', chatId);

            if (msgError) {
                console.error("❌ Error DB al borrar messages (¡Probablemente RLS!):", msgError);
                throw msgError;
            }

            console.log("Vault: Chat history completely burned.");
            return { success: true };
        } catch (error) {
            console.error("Failed to burn chat history:", error);
            throw error;
        }
    },

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