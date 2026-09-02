import { useContext, useState } from "react";
import { Keyboard } from "react-native";

import { chatApi } from "@/api/chat";
import { AuthContext } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { cleanChatMessage } from "@/utils/chatUtils";
import { vaultCrypto } from "@/utils/crypto";

export function useReplyStory(currentGroup: any, currentStoryId: any, onSent?: () => void) {
    const { session } = useContext(AuthContext)

    const [replyTextStory, setReplyTextStory] = useState<string>("")
    const [loadingReplyStory, setLoadingReplyStory] = useState<boolean>(false)

    const handleReplyStory = async () => {
        if (!currentStoryId || loadingReplyStory) return

        const cleanedMessage = cleanChatMessage(replyTextStory);
        if (!cleanedMessage) return

        // Don't dismiss the keyboard here — doing it before the tap is processed
        // is what made the send button need a second tap. We close it *after* a
        // successful send instead.
        setLoadingReplyStory(true)
        try {
            const targetFriendId = currentGroup.user_id

            const chatId = await chatApi.getOrCreateChat(targetFriendId)

            const profRes = await supabase.from('profiles').select('*').eq('id', targetFriendId).single()
            if (profRes.error) {
                console.error("Error fetching friend profile:", profRes.error);
                throw profRes.error;
            }
            const friendProfile = profRes.data
            if (!friendProfile?.public_key) {
                console.error("Friend profile has no public_key:", friendProfile);
                throw new Error("El destinatario no tiene una llave pública configurada.");
            }

            const encryptedContent = await vaultCrypto.encryptMessage(cleanedMessage, friendProfile.public_key);

            const { error: insertError } = await supabase.from('messages').insert({
                chat_id: chatId,
                sender_id: session?.user.id,
                content: encryptedContent,
                type: 'text',
                is_read: false,
                reply_to_story_id: currentStoryId
            });
            if (insertError) {
                console.error("Error inserting message:", insertError);
                throw insertError;
            }

            setReplyTextStory("")
            Keyboard.dismiss()
            onSent?.()
        } catch (error) {
            console.error("handleReplyStory failed:", error);
        } finally {
            setLoadingReplyStory(false)
        }
    }

    return {
        replyTextStory,
        loadingReplyStory,

        setReplyTextStory,
        handleReplyStory,
    }
}
