
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
        confirmNewIdentity: () => Promise<void>;
    };
}

export const AuthContext = createContext<AuthContextValue>({
    session: null,
    isLoading: true,
    vault: {
        state: 'loading',
        confirmNewIdentity: async () => { },
    },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const {
        setupSecuritySync,
        setupVaultIdentity,
        purgeVaultData,
        vaultState,
        confirmNewIdentity,
    } = useVaultSecurity();
    useProtectedRoute(session, isLoading);

    useEffect(() => {
        let securitySubscription: any = null;
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

                if (currentSession) {
                    setupVaultIdentity(currentSession);
                    securitySubscription = await setupSecuritySync(currentSession.user.id);
                }
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
                    if (!securitySubscription) {
                        securitySubscription = await setupSecuritySync(currentSession.user.id);
                    }
                } else if (event === 'SIGNED_OUT') {
                    await purgeVaultData();
                    if (securitySubscription) {
                        supabase.removeChannel(securitySubscription);
                        securitySubscription = null;
                    }
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
            if (securitySubscription) supabase.removeChannel(securitySubscription);
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
                },
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
