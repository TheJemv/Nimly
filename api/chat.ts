import { supabase } from "@/lib/supabase";

export const chatApi = {
    async getOrCreateChat(targetId: string) {
        if (!targetId || targetId === 'undefined') {
            console.error("Target ID is invalid:", targetId);
            return null;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("User not authenticated");

        // Look for a shared chat
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

        // Create a new chat
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
     * PURGE: Physically deletes the .vault file from the vault and the message from the database.
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
     * BURN HISTORY: Deletes all messages and .vault files for a specific chat,
     * while keeping the chat room open.
     */
/**
     * BURN HISTORY: Deletes all messages and .vault files for a specific chat.
     */
    async burnChatHistory(chatId: string) {
        try {
            // 1. Fetch all messages to identify which ones are media
            const { data: messages, error: fetchError } = await supabase
                .from('messages')
                .select('id, content, type')
                .eq('chat_id', chatId);

            if (fetchError) throw fetchError;
            if (!messages || messages.length === 0) return { success: true };

            // 2. Filter and delete the physical files from Storage
            const mediaFiles = messages
                .filter(m => m.type === 'image' || m.type === 'video' || m.type === 'image-view-once')
                .map(m => m.content);

            if (mediaFiles.length > 0) {
                if (__DEV__) console.log(`Vault: Burning ${mediaFiles.length} physical files...`);
                const { error: storageError } = await supabase.storage.from('chat-media').remove(mediaFiles);
                if (storageError) console.error("⚠️ Warning: some files were not deleted from storage:", storageError);
            }

            const messageIds = messages.map(m => m.id);

            // 3. Destroy metadata (strict error check)
            const { error: mediaError } = await supabase
                .from('messages_media')
                .delete()
                .in('message_id', messageIds);

            if (mediaError) {
                console.error("❌ DB error deleting messages_media (foreign key constraint?):", mediaError);
                throw mediaError;
            }

            // 4. Final destruction of the text messages (strict error check)
            const { error: msgError } = await supabase
                .from('messages')
                .delete()
                .eq('chat_id', chatId);

            if (msgError) {
                console.error("❌ DB error deleting messages (probably RLS!):", msgError);
                throw msgError;
            }

            if (__DEV__) console.log("Vault: Chat history completely burned.");
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
            console.error("❌ [API_READ] Vault error while marking as read:", error);
            return { success: false, error };
        }
    },
};