import { getThemeColor } from "@/constants/theme";
import * as Sentry from "@sentry/react-native";
import * as SplashScreen from "expo-splash-screen";
import * as Updates from "expo-updates";
import React from "react";
import { ActivityIndicator, DevSettings, StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * Recovery screen shown when the app can't start — a render crash caught by the
 * boundary, or a startup that never finished (watchdog). It also silently pulls
 * a newer OTA update in the background, so a fix published server-side heals the
 * app on its own without the user doing anything.
 */
export function AppRecoveryView({ reason }: { reason: "crash" | "timeout" }) {
   const [busy, setBusy] = React.useState(false);
   const [autoHealing, setAutoHealing] = React.useState(!__DEV__);

   React.useEffect(() => {
      if (__DEV__) return;
      let cancelled = false;
      (async () => {
         try {
            const res = await Updates.checkForUpdateAsync();
            if (cancelled) return;
            if (res.isAvailable) {
               await Updates.fetchUpdateAsync();
               if (!cancelled) await Updates.reloadAsync();
               return;
            }
         } catch {
            /* offline / dev / no update — fall through to manual retry */
         }
         if (!cancelled) setAutoHealing(false);
      })();
      return () => {
         cancelled = true;
      };
   }, []);

   const reload = async () => {
      if (busy) return;
      setBusy(true);
      try {
         await Updates.reloadAsync();
      } catch {
         // Dev client / Expo Go: reloadAsync isn't available.
         try {
            DevSettings.reload();
         } catch {
            setBusy(false);
         }
      }
   };

   return (
      <View style={styles.container}>
         <View style={styles.content}>
            <Text style={styles.title}>Nimly couldn&apos;t start</Text>
            <Text style={styles.subtitle}>
               {reason === "timeout"
                  ? "Startup is taking longer than usual. Reloading usually fixes it."
                  : "Something went wrong while loading. Reloading usually fixes it."}
            </Text>

            {autoHealing ? (
               <View style={styles.healingRow}>
                  <ActivityIndicator color={getThemeColor("tint")} />
                  <Text style={styles.healingText}>Checking for a fix…</Text>
               </View>
            ) : (
               <TouchableOpacity onPress={reload} style={styles.btn} disabled={busy} activeOpacity={0.7}>
                  {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>Reload</Text>}
               </TouchableOpacity>
            )}
         </View>
      </View>
   );
}

interface State {
   hasError: boolean;
}

export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
   state: State = { hasError: false };

   static getDerivedStateFromError(): State {
      return { hasError: true };
   }

   componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
      console.error("❌ [APP] Fatal render error:", error, info);
      // Este boundary "maneja" el error, así que el handler global de Sentry no
      // lo vería — lo reportamos explícitamente.
      Sentry.captureException(error, {
         contexts: { react: { componentStack: info?.componentStack ?? undefined } },
         tags: { boundary: "app-root" },
      });
      // Whatever happens, get off the splash screen.
      SplashScreen.hideAsync().catch(() => { });
   }

   render() {
      if (this.state.hasError) return <AppRecoveryView reason="crash" />;
      return this.props.children;
   }
}

const styles = StyleSheet.create({
   container: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", padding: 32 },
   content: { alignItems: "center", maxWidth: 320 },
   title: { color: "#fff", fontSize: 20, fontWeight: "700", marginBottom: 10, textAlign: "center" },
   subtitle: { color: "#8E8E93", fontSize: 14, lineHeight: 20, textAlign: "center", marginBottom: 28 },
   healingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
   healingText: { color: "#8E8E93", fontSize: 13 },
   btn: {
      backgroundColor: getThemeColor("tint"),
      paddingHorizontal: 40,
      paddingVertical: 14,
      borderRadius: 14,
      minWidth: 160,
      alignItems: "center",
   },
   btnText: { color: "#000", fontSize: 15, fontWeight: "700" },
});
