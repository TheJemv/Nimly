// Tiny signal to coordinate the splash screen with Home's first load.
// The native splash hides as soon as auth+vault resolve, but that doesn't
// mean the feed is ready yet — without this, the user sees the splash
// disappear and then the posts/stories spinners loading separately.
// HomeScreen calls markHomeReady() when it finishes its first load, and
// RootLayoutNav covers that wait with an overlay identical to the splash in
// the meantime (see app/_layout.tsx).
import { createContext, useCallback, useContext, useState } from 'react';

interface AppReadyContextValue {
    /** true once Home has loaded its first feed (posts + stories). */
    homeReady: boolean;
    /** Called by HomeScreen when that first load finishes. Idempotent. */
    markHomeReady: () => void;
}

const AppReadyContext = createContext<AppReadyContextValue>({
    homeReady: false,
    markHomeReady: () => { },
});

export function AppReadyProvider({ children }: { children: React.ReactNode }) {
    const [homeReady, setHomeReady] = useState(false);
    const markHomeReady = useCallback(() => setHomeReady(true), []);

    return (
        <AppReadyContext.Provider value={{ homeReady, markHomeReady }}>
            {children}
        </AppReadyContext.Provider>
    );
}

export const useAppReady = () => useContext(AppReadyContext);
