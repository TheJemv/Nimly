import { supabase } from "@/lib/supabase";
import { debounce } from "@/utils/debounce";
import { useEffect, useState } from "react";

/**
 * Total unread messages that I did NOT send (RLS already scopes this to my
 * chats). This is the number shown on the Messages tab badge.
 */
export function useTotalUnread(): number {
    const [count, setCount] = useState(0);

    useEffect(() => {
        let channel: any;
        let cancelled = false;

        const fetchTotalUnread = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user || cancelled) return;

                const { count: c, error } = await supabase
                    .from("messages")
                    .select("*", { count: "exact", head: true })
                    .neq("sender_id", user.id)
                    .eq("is_read", false);

                if (error) throw error;
                if (!cancelled) setCount(c || 0);
            } catch (e) {
                console.error("❌ [UNREAD] Error fetching unread count:", e);
            }
        };

        // Collapses bursts of realtime events into a single refetch.
        const debouncedRefetch = debounce(fetchTotalUnread, 800);

        fetchTotalUnread();

        channel = supabase
            .channel(`total_unread_${Date.now()}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "messages" },
                () => debouncedRefetch(),
            )
            .subscribe();

        return () => {
            cancelled = true;
            debouncedRefetch.cancel();
            if (channel) supabase.removeChannel(channel);
        };
    }, []);

    return count;
}

/** Formats the counter iOS-style: 1..9 as-is, 10+ as "9+". */
export const formatUnreadBadge = (n: number): string | null => {
    if (n <= 0) return null;
    return n > 9 ? "9+" : `${n}`;
};
