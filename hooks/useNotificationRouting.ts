import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";

// Id of the last notification we already opened. It's module-level (not a ref)
// so it survives layout remounts —e.g. when the VaultKeyGate closes and
// reopens— and we don't navigate twice for the same push.
let handledNotificationId: string | null = null;

interface PushData {
    type?: string;
    table?: string;
    senderId?: string;
    sender?: unknown;
    notificationType?: string;
}

/**
 * Routes the app when the user taps a notification:
 *  - messages         → opens /chat with the conversation of whoever wrote it
 *  - everything else  → opens the notifications screen
 *
 * Uses `useLastNotificationResponse`, which covers both the app already open
 * and a cold start (app closed). Before, there was only a listener that
 * mounted AFTER the OS had already delivered the tap, so on cold start the
 * notification "did nothing".
 */
export function useNotificationRouting() {
    const router = useRouter();
    const response = Notifications.useLastNotificationResponse();

    useEffect(() => {
        if (!response) return;
        // Only a tap on the notification itself (not actions/buttons).
        if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;

        const request = response.notification.request;
        if (handledNotificationId === request.identifier) return;
        handledNotificationId = request.identifier;

        const data = (request.content.data ?? {}) as PushData;
        const isMessage =
            data.type === "message" || data.table === "messages" || !!data.senderId;

        // Small defer: on cold start this effect can run in the same tick in
        // which the navigator is still mounting the first screen.
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
