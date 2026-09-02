import { createContext, useContext, useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { User as Profile } from '@/types/types';


export const ProfileContext = createContext<{
    profile: Profile | null;
    isLoadingProfile: boolean;
    refreshProfile: () => Promise<void>;
}>({
    profile: null,
    isLoadingProfile: true,
    refreshProfile: async () => { },
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
    const { session } = useAuth();

    const [profile, setProfile] = useState<Profile | null>(null);
    const [isLoadingProfile, setIsLoadingProfile] = useState(true);

    const loadProfile = async () => {
        if (!session?.user?.id) return;

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();

            if (error) throw error;
            setProfile(data);
        } catch (error) {
            console.error("Error loading global profile:", error);
        } finally {
            setIsLoadingProfile(false);
        }
    };

    useEffect(() => {
        if (!session?.user?.id) {
            setProfile(null);
            setIsLoadingProfile(false);
            return;
        }

        // Carga inicial
        loadProfile();
        const channel = supabase
            .channel('global-profile-changes')
            .on('postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'profiles',
                    filter: `id=eq.${session.user.id}`
                },
                (payload) => {
                    if (__DEV__) console.log("Global profile updated");
                    setProfile(payload.new as Profile); // Actualización instantánea en memoria
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [session?.user?.id]);

    return (
        <ProfileContext.Provider value={{ profile, isLoadingProfile, refreshProfile: loadProfile }}>
            {children}
        </ProfileContext.Provider>
    );
}

export const useProfile = () => useContext(ProfileContext);