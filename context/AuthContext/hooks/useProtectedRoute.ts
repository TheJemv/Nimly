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

        // Avoids triggering the same replace repeatedly while `segments`
        // stabilizes after navigation.
        if (target && lastRedirect.current !== target) {
            lastRedirect.current = target;
            router.replace(target as any);
        } else if (!target) {
            lastRedirect.current = null;
        }
    }, [session, segments, isLoading]);
}
