
import { createContext, useContext, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import * as Sentry from '@sentry/react-native';
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
        /** Legitimate migration: creates a new identity on this device. */
        confirmNewIdentity: () => Promise<void>;
        /** Creates the 6-digit PIN (the 'needs_passcode' screen). */
        createPasscode: (code: string) => Promise<PasscodeResult>;
        /** Unlocks the 12h auto-lock (the 'locked_timeout' screen). */
        unlockWithPasscode: (code: string) => Promise<PasscodeResult>;
        /** Account locked on another device → takeover with the PIN. */
        takeoverWithPasscode: (code: string) => Promise<PasscodeResult>;
        /** Fallback: takeover with the account password. */
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

    // Attaches only the id to Sentry events (no PII: no email / IP).
    useEffect(() => {
        Sentry.setUser(session?.user?.id ? { id: session.user.id } : null);
    }, [session?.user?.id]);

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

                // The vault decides for itself when to claim the device
                // (only if the vault ends up usable here, not in 'needs_new_identity').
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
