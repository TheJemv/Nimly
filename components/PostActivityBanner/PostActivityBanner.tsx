import { BlurView } from "expo-blur";
import { SymbolView } from "expo-symbols";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getThemeColor } from "@/constants/theme";
import { usePostActivity, type PostActivityStatus } from "@/context/PostActivityContext";

import { styles } from "./PostActivityBanner.styles";

const TEXT = getThemeColor("text");
const TEXT_SECONDARY = getThemeColor("textSecondary");
const TINT = getThemeColor("tint");
const SUCCESS = getThemeColor("success");

// Content height of the native stack header; the status-bar inset goes on top.
const HEADER_CONTENT_HEIGHT = 44;

const UPLOAD_LABELS = {
    running: "Uploading your post…",
    done: "Posted",
    error: "Couldn't upload your post",
} as const;

const DELETE_LABELS = {
    running: "Deleting post…",
    done: "Post deleted",
    error: "Couldn't delete the post",
} as const;

interface ActivityPillProps {
    status: Exclude<PostActivityStatus, "idle">;
    label: string;
    onRetry?: () => void;
    onDismiss: () => void;
}

function ActivityPill({ status, label, onRetry, onDismiss }: ActivityPillProps) {
    return (
        <Animated.View entering={FadeInUp.duration(220)} exiting={FadeOutUp.duration(180)}>
            <BlurView intensity={40} tint="dark" style={styles.pill}>
                {status === "running" && <ActivityIndicator color={TEXT} />}
                {status === "done" && <SymbolView name="checkmark.circle.fill" size={22} tintColor={SUCCESS} />}
                {status === "error" && <SymbolView name="exclamationmark.circle.fill" size={22} tintColor={TINT} />}

                <Text style={styles.label} numberOfLines={1}>{label}</Text>

                {status === "error" && (
                    <>
                        {onRetry && (
                            <TouchableOpacity onPress={onRetry} hitSlop={8} accessibilityRole="button">
                                <Text style={styles.retry}>Retry</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss">
                            <SymbolView name="xmark" size={14} weight="bold" tintColor={TEXT_SECONDARY} />
                        </TouchableOpacity>
                    </>
                )}
            </BlurView>
        </Animated.View>
    );
}

/** Notification-style banner for what's happening to posts in the background (uploading / deleting). */
export default function PostActivityBanner() {
    const { uploadStatus, retryUpload, dismissUpload, deleteStatus, dismissDelete } = usePostActivity();
    const insets = useSafeAreaInsets();

    // The wrapper stays mounted so each pill animates out on its own.
    return (
        <View style={[styles.wrap, { top: insets.top + HEADER_CONTENT_HEIGHT + 8 }]} pointerEvents="box-none">
            {deleteStatus !== "idle" && (
                <ActivityPill status={deleteStatus} label={DELETE_LABELS[deleteStatus]} onDismiss={dismissDelete} />
            )}
            {uploadStatus !== "idle" && (
                <ActivityPill
                    status={uploadStatus}
                    label={UPLOAD_LABELS[uploadStatus]}
                    onRetry={retryUpload}
                    onDismiss={dismissUpload}
                />
            )}
        </View>
    );
}
