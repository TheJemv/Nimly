import { useAppForeground } from "@/hooks/useAppForeground";
import { supabase } from "@/lib/supabase";
import { REPLY_SELECT } from "@/screens/ChatScreen/hooks/useChatSync";
import { appendCachedMessage } from "@/utils/chatMessageCache";
import { useEffect, useState } from "react";

/**
 * Keeps the per-chat disk cache warm for messages that arrive while that
 * chat's own screen isn't open — `useChatSync`'s write-through only runs
 * while mounted, so a message received while you're elsewhere in the app
 * (chat list, another chat, another tab) previously wasn't cached until the
 * network reconcile on the next open caught up, a few seconds later. This
 * mounts once for the whole app session and mirrors incoming messages into
 * the cache the instant they arrive, so the next open already has them.
 *
 * Only handles messages FROM someone else: our own sends only ever happen
 * from inside an open chat screen, whose own write-through already covers
 * them.
 */
export function useIncomingMessageCache(currentUserId: string | null) {
    const [resyncNonce, setResyncNonce] = useState(0);
    useAppForeground(() => setResyncNonce((n) => n + 1));

    useEffect(() => {
        if (!currentUserId) return;

        // RLS scopes this to my own chats, same trust model useChatsList/
        // useTotalUnread already rely on for their own all-messages channels.
        const channel = supabase
            .channel(`incoming_cache_${currentUserId}-${Date.now()}`)
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "messages" },
                (payload) => {
                    const row: any = payload.new;
                    if (!row || row.sender_id === currentUserId) return;

                    (async () => {
                        let full = row;
                        // Bare INSERT payloads don't carry the joined reply
                        // preview — re-fetch with it so the cached row renders
                        // identically to one that came from a normal page fetch.
                        if (row.reply_to_id || row.reply_to_story_id) {
                            const { data } = await supabase
                                .from("messages")
                                .select(REPLY_SELECT)
                                .eq("id", row.id)
                                .single();
                            if (data) full = data;
                        }
                        appendCachedMessage(row.sender_id, full, currentUserId);
                    })();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUserId, resyncNonce]);
}
