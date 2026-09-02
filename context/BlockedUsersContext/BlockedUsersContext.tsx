import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { blocksApi } from "@/api/blocks";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

interface BlockedUsersContextValue {
    /** IDs de usuarios que YO he bloqueado. */
    blockedIds: Set<string>;
    /** `true` si el usuario está bloqueado por mí. */
    isBlocked: (userId?: string | null) => boolean;
    /** Oculta a un usuario al instante (antes de que responda el servidor). */
    blockLocally: (userId: string) => void;
    /** Revierte un bloqueo local. */
    unblockLocally: (userId: string) => void;
    /** Vuelve a leer la lista desde el servidor. */
    refresh: () => Promise<void>;
}

const BlockedUsersContext = createContext<BlockedUsersContextValue>({
    blockedIds: new Set(),
    isBlocked: () => false,
    blockLocally: () => { },
    unblockLocally: () => { },
    refresh: async () => { },
});

export function BlockedUsersProvider({ children }: { children: React.ReactNode }) {
    const { session } = useAuth();
    const userId = session?.user?.id ?? null;
    const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
    const blockedRef = useRef(blockedIds);
    blockedRef.current = blockedIds;

    const refresh = useCallback(async () => {
        if (!userId) {
            setBlockedIds(new Set());
            return;
        }
        try {
            const ids = await blocksApi.getBlockedIds();
            setBlockedIds(new Set(ids));
        } catch (e) {
            if (__DEV__) console.warn("No se pudo cargar la lista de bloqueados:", e);
        }
    }, [userId]);

    useEffect(() => {
        refresh();
        if (!userId) return;

        const channel = supabase
            .channel(`blocked-users-${userId}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "blocked_users", filter: `blocker_id=eq.${userId}` },
                () => refresh(),
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [userId, refresh]);

    const blockLocally = useCallback((id: string) => {
        setBlockedIds((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
        });
    }, []);

    const unblockLocally = useCallback((id: string) => {
        setBlockedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    }, []);

    const isBlocked = useCallback(
        (id?: string | null) => (id ? blockedRef.current.has(id) : false),
        [],
    );

    const value = useMemo(
        () => ({ blockedIds, isBlocked, blockLocally, unblockLocally, refresh }),
        [blockedIds, isBlocked, blockLocally, unblockLocally, refresh],
    );

    return <BlockedUsersContext.Provider value={value}>{children}</BlockedUsersContext.Provider>;
}

export const useBlockedUsers = () => useContext(BlockedUsersContext);
