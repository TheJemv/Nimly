
import { createContext, useContext, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';

// Custom Hooks
import { useProtectedRoute, useVaultSecurity } from './hooks';
import type { PasscodeResult, VaultState } from './hooks/useVaultSecurity';

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
        /** Crea el PIN de 6 dígitos (pantalla 'needs_passcode'). */
        createPasscode: (code: string) => Promise<PasscodeResult>;
        /** Desbloqueo del auto-lock de 12h (pantalla 'locked_timeout'). */
        unlockWithPasscode: (code: string) => Promise<PasscodeResult>;
        /** Cuenta bloqueada en otro dispositivo → takeover con el PIN. */
        takeoverWithPasscode: (code: string) => Promise<PasscodeResult>;
        /** Fallback: takeover con la contraseña de la cuenta. */
        forceTakeover: (password: string) => Promise<PasscodeResult>;
    };
}

const notReady: PasscodeResult = { ok: false, message: 'not ready' };

export const AuthContext = createContext<AuthContextValue>({
    session: null,
    isLoading: true,
    vault: {
        state: 'loading',
        confirmNewIdentity: async () => { },
        createPasscode: async () => notReady,
        unlockWithPasscode: async () => notReady,
        takeoverWithPasscode: async () => notReady,
        forceTakeover: async () => notReady,
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
        createPasscode,
        unlockWithPasscode,
        takeoverWithPasscode,
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
                    createPasscode,
                    unlockWithPasscode,
                    takeoverWithPasscode,
                    forceTakeover,
                },
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
