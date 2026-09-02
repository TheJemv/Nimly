import { Alert } from "react-native";

import type { ReportReason } from "@/api/reports";

export const REPORT_REASONS: { label: string; value: ReportReason }[] = [
    { label: "Spam", value: "spam" },
    { label: "Harassment or bullying", value: "harassment" },
    { label: "Inappropriate or objectionable content", value: "inappropriate_content" },
    { label: "Scam or fraud", value: "scam" },
    { label: "Other", value: "other" },
];

/**
 * Muestra un selector nativo con los motivos de reporte y resuelve con el motivo
 * elegido, o `null` si el usuario cancela.
 */
export function promptReportReason(
    title = "Report",
    message = "Why are you reporting this?",
): Promise<ReportReason | null> {
    return new Promise((resolve) => {
        Alert.alert(
            title,
            message,
            [
                ...REPORT_REASONS.map((r) => ({
                    text: r.label,
                    onPress: () => resolve(r.value),
                })),
                { text: "Cancel", style: "cancel" as const, onPress: () => resolve(null) },
            ],
            { cancelable: true, onDismiss: () => resolve(null) },
        );
    });
}
