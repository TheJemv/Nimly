import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";

// Id de la última notificación que ya abrimos. Es módulo (no ref) para que
// sobreviva a remounts del layout —p. ej. cuando el VaultKeyGate se cierra y
// se vuelve a abrir— y no re-navegar dos veces por la misma push.
let handledNotificationId: string | null = null;

interface PushData {
    type?: string;
    table?: string;
    senderId?: string;
    sender?: unknown;
    notificationType?: string;
}

/**
 * Enruta la app cuando el usuario toca una notificación:
 *  - mensajes  → abre /chat con la conversación de quien escribió
 *  - el resto  → abre la pantalla de notificaciones
 *
 * Usa `useLastNotificationResponse`, que cubre tanto la app abierta como el
 * arranque en frío (app cerrada). Antes solo había un listener que se montaba
 * DESPUÉS de que el SO ya había entregado el tap, así que en cold start la
 * notificación "no hacía nada".
 */
export function useNotificationRouting() {
    const router = useRouter();
    const response = Notifications.useLastNotificationResponse();

    useEffect(() => {
        if (!response) return;
        // Solo el tap sobre la notificación en sí (no acciones/botones).
        if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;

        const request = response.notification.request;
        if (handledNotificationId === request.identifier) return;
        handledNotificationId = request.identifier;

        const data = (request.content.data ?? {}) as PushData;
        const isMessage =
            data.type === "message" || data.table === "messages" || !!data.senderId;

        // Defer pequeño: en cold start este efecto puede correr en el mismo tick
        // en que el navegador aún está montando la primera pantalla.
        const t = setTimeout(() => {
            try {
                if (isMessage && data.senderId) {
                    router.navigate({
                        pathname: "/(app)/chat",
                        params: {
                            id: data.senderId,
                            ...(data.sender ? { user: JSON.stringify(data.sender) } : {}),
                        },
                    });
                } else if (isMessage) {
                    router.navigate("/(app)/(tabs)/(messages)");
                } else {
                    router.navigate("/notifications");
                }
            } catch (e) {
                console.warn("[notif-routing] navigation failed", e);
            }
        }, 300);

        return () => clearTimeout(t);
    }, [response, router]);
}
