
import { createContext, useContext, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';

// Custom Hooks
import { useProtectedRoute, useVaultSecurity } from './hooks';
import type { VaultState } from './hooks/useVaultSecurity';

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
    if (__DEV__) return promise;
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error('Auth operation timed out')), ms)
        ),
    ]);
};

interface AuthContextValue {
    session: Session | null;
    isLoading: boolean;
    vault: {
        state: VaultState;
        /** Migración legítima: crea identidad nueva en este dispositivo. */
        confirmNewIdentity: () => Promise<void>;
        /** Cuenta bloqueada en otro dispositivo: toma el control con contraseña. */
        forceTakeover: (password: string) => Promise<string | null>;
    };
}

export const AuthContext = createContext<AuthContextValue>({
    session: null,
    isLoading: true,
    vault: {
        state: 'loading',
        confirmNewIdentity: async () => { },
        forceTakeover: async () => 'not ready',
    },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const {
        setupVaultIdentity,
        purgeVaultData,
        vaultState,
        confirmNewIdentity,
        forceTakeover,
    } = useVaultSecurity();
    useProtectedRoute(session, isLoading);

    useEffect(() => {
        let isMounted = true;
        let hasChecked = false;

        const checkSession = async () => {
            if (hasChecked) return;
            hasChecked = true;
            try {
                const { data: { session: currentSession } } = await withTimeout(
                    supabase.auth.getSession(),
                    10000
                );

                if (!isMounted) return;

                setSession(currentSession);
                setIsLoading(false);

                // El vault decide por sí mismo cuándo reclamar el dispositivo
                // (solo si la bóveda queda usable aquí, no en 'needs_new_identity').
                if (currentSession) setupVaultIdentity(currentSession);
            } catch (e) {
                console.error("Session check failed:", e);
                if (isMounted) {
                    setSession(null);
                    setIsLoading(false);
                }
            }
        };

        checkSession();

        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
            if (!isMounted) return;
            try {
                setSession(currentSession);
                if (currentSession) {
                    setupVaultIdentity(currentSession);
                } else if (event === 'SIGNED_OUT') {
                    await purgeVaultData();
                }
            } catch (e) {
                console.error("Auth state change handler failed:", e);
                if (isMounted && !currentSession) setSession(null);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        });

        return () => {
            isMounted = false;
            authListener.subscription.unsubscribe();
        };
    }, []);

    return (
        <AuthContext.Provider
            value={{
                session,
                isLoading,
                vault: {
                    state: vaultState,
                    confirmNewIdentity,
                    forceTakeover,
                },
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
