import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { dismissChatNotifications, isActiveChat, setActiveChat } from "./notifications";
import { useAppForeground } from "./useAppForeground";

/**
 * While a chat is on screen its pushes are redundant: clears the ones already
 * in Notification Center (on open, and on coming back to the app with the chat
 * still open) and keeps new ones for it from showing a banner.
 */
export function useChatNotifications(chatId: string | null) {
    useFocusEffect(
        useCallback(() => {
            if (!chatId) return;
            setActiveChat(chatId);
            dismissChatNotifications(chatId);
            return () => {
                if (isActiveChat(chatId)) setActiveChat(null);
            };
        }, [chatId])
    );

    useAppForeground(() => {
        if (chatId && isActiveChat(chatId)) dismissChatNotifications(chatId);
    });
}
