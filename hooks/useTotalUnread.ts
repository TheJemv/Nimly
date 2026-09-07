import { supabase } from "@/lib/supabase";
import { debounce } from "@/utils/debounce";
import { useEffect, useState } from "react";

/**
 * Total de mensajes sin leer que NO envié yo (RLS ya acota a mis chats). Es el
 * número que pinta el badge de la pestaña de Mensajes.
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

        // Colapsa ráfagas de eventos realtime en un solo refetch.
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

/** Formatea el contador estilo iOS: 1..9 tal cual, 10+ como "9+". */
export const formatUnreadBadge = (n: number): string | null => {
    if (n <= 0) return null;
    return n > 9 ? "9+" : `${n}`;
};
