import { Session } from '@supabase/supabase-js';
import { useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';

export function useProtectedRoute(session: Session | null, isLoading: boolean) {
    const segments = useSegments();
    const router = useRouter();
    const lastRedirect = useRef<string | null>(null);

    useEffect(() => {
        if (isLoading) return;

        const inAuthGroup = segments[0] === '(auth)';

        let target: string | null = null;
        if (!session && !inAuthGroup) target = '/(auth)';
        else if (session && inAuthGroup) target = '/(app)/(tabs)/(home)';

        // Evita disparar el mismo replace repetidamente mientras `segments`
        // se estabiliza tras la navegación.
        if (target && lastRedirect.current !== target) {
            lastRedirect.current = target;
            router.replace(target as any);
        } else if (!target) {
            lastRedirect.current = null;
        }
    }, [session, segments, isLoading]);
}
