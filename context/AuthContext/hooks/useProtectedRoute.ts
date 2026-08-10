import { Session } from '@supabase/supabase-js';
import { useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';

export function useProtectedRoute(session: Session | null, isLoading: boolean) {
    const segments = useSegments();
    const router = useRouter();

    useEffect(() => {
        if (isLoading) return;

        const inAuthGroup = segments[0] === '(auth)';

        if (!session && !inAuthGroup) {
            router.replace('/(auth)');
        } else if (session && inAuthGroup) {
            router.replace('/(app)/(tabs)/(home)');
        }
    }, [session, segments, isLoading]);
}