// Señal minúscula para coordinar el splash con la primera carga del Home.
// El splash nativo se oculta en cuanto auth+vault resuelven, pero eso no
// significa que el feed ya esté listo — sin esto, el usuario ve el splash
// desaparecer y luego los spinners de posts/stories cargando por separado.
// HomeScreen llama a markHomeReady() cuando termina su primera carga, y
// RootLayoutNav tapa esa espera con un overlay idéntico al splash mientras
// tanto (ver app/_layout.tsx).
import { createContext, useCallback, useContext, useState } from 'react';

interface AppReadyContextValue {
    /** true una vez que el Home ya cargó su primer feed (posts + stories). */
    homeReady: boolean;
    /** Llamado por HomeScreen cuando termina esa primera carga. Idempotente. */
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
