import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { debounce } from "@/utils/debounce";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";

/**
 * Unread activity notifications (likes, comments, friend requests...): the
 * number on the bell in the Home header. Chat messages are left out, same as
 * on the notifications screen -- they have their own badge on the Messages tab.
 */
export function useUnreadNotifications(): number {
    const { session } = useAuth();
    const userId = session?.user?.id;
    const [count, setCount] = useState(0);

    const fetchCount = useCallback(async () => {
        if (!userId) { setCount(0); return; }
        try {
            const { count: c, error } = await supabase
                .from("notifications")
                .select("id", { count: "exact", head: true })
                .eq("user_id", userId)
                .neq("type", "message")
                .eq("is_read", false);

            if (error) throw error;
            setCount(c || 0);
        } catch (e) {
            console.error("[UNREAD NOTIFS] Error fetching unread count:", e);
        }
    }, [userId]);

    // On focus too: coming back from the notifications screen (which marks
    // everything read) clears the badge right away instead of waiting on realtime.
    useFocusEffect(useCallback(() => { fetchCount(); }, [fetchCount]));

    useEffect(() => {
        if (!userId) return;
        // Collapses bursts (e.g. "mark all read" updates every row) into one refetch.
        const debouncedRefetch = debounce(fetchCount, 500);

        const channel: RealtimeChannel = supabase
            .channel(`unread_notifs_${userId}_${Date.now()}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
                () => debouncedRefetch(),
            )
            .subscribe();

        return () => {
            debouncedRefetch.cancel();
            supabase.removeChannel(channel);
        };
    }, [userId, fetchCount]);

    return count;
}
