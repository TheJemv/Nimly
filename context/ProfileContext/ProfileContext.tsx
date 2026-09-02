import { createContext, useContext, useEffect, useState } from 'react';

import { buildDefaultAvatarConfig, buildDefaultAvatarUrl } from '@/constants/dicebear';
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

            // Red de seguridad: si por alguna razón el perfil quedó sin avatar
            // (trigger no aplicado, cuenta antigua, etc.) generamos uno a partir
            // del username y lo persistimos una sola vez.
            if (data && !data.avatar_config && data.username) {
                const avatar_config = buildDefaultAvatarConfig(data.username);
                const avatar_url = buildDefaultAvatarUrl(data.username);
                setProfile({ ...data, avatar_config, avatar_url });

                const { error: patchError } = await supabase
                    .from('profiles')
                    .update({ avatar_config, avatar_url })
                    .eq('id', session.user.id);
                if (patchError && __DEV__) console.warn('No se pudo guardar el avatar por defecto:', patchError.message);
            } else {
                setProfile(data);
            }
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