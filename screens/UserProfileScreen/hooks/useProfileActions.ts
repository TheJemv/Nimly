import { blocksApi } from '@/api/blocks';
import { friendsApi } from '@/api/friends';
import { reportsApi } from '@/api/reports';
import { useBlockedUsers } from '@/context/BlockedUsersContext';
import { supabase } from '@/lib/supabase';
import { promptReportReason } from '@/utils/moderation';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Alert } from 'react-native';

interface UseProfileActionsProps {
    id: string;
    username?: string;
    statusInfo: any;
    setLoading: (v: boolean) => void;
    refetch: () => Promise<void>;
}

export function useProfileActions({ id, username, statusInfo, setLoading, refetch }: UseProfileActionsProps) {
    const [sending, setSending] = useState(false);
    const { blockLocally, unblockLocally } = useBlockedUsers();

    const handleCopyUsername = async () => {
        if (username) {
            await Clipboard.setStringAsync(`@${username}`);
            Alert.alert("Copied", "Username copied to clipboard.");
        }
    };

    const handleSeverConnection = () => {
        Alert.alert(
            "Remove Connection",
            `This will remove your connection with @${username}. Are you sure?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Sever",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            setLoading(true);
                            await friendsApi.severConnection(id);
                            await refetch();
                        } catch (e) {
                            Alert.alert("Error", "Action could not be completed.");
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const handleBlockUser = () => {
        Alert.alert(
            "Block User",
            `@${username} will no longer be able to contact you, see your content, or send you connection requests. Their content will be removed from your feed immediately.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Block",
                    style: "destructive",
                    onPress: async () => {
                        // Preguntamos el motivo para incluirlo en el reporte que
                        // recibe el desarrollador. Cancelar el motivo NO cancela
                        // el bloqueo.
                        const reason = await promptReportReason(
                            "Block User",
                            "Tell us what's wrong so we can review this account.",
                        );

                        // Ocultamos su contenido al instante.
                        blockLocally(id);
                        try {
                            setLoading(true);
                            await blocksApi.blockUser(id, reason ?? 'other');
                            await refetch();
                        } catch (e: any) {
                            if (e.message === "AlreadyBlocked") {
                                Alert.alert("Note", "You have already blocked this user.");
                            } else {
                                unblockLocally(id);
                                Alert.alert("Error", __DEV__ ? String(e?.message || e) : "Action could not be completed.");
                            }
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const handleUnblockUser = () => {
        Alert.alert(
            "Unblock User",
            `@${username} will be able to interact with you again.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Unblock",
                    onPress: async () => {
                        unblockLocally(id);
                        try {
                            setLoading(true);
                            await blocksApi.unblockUser(id);
                            await refetch();
                        } catch (e) {
                            blockLocally(id);
                            Alert.alert("Error", "Action could not be completed.");
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const handleConnectAction = async () => {
        setSending(true);
        try {
            if (statusInfo?.isReceiver) {
                await friendsApi.acceptFriendship({
                    id: statusInfo.requestId,
                    from_id: id,
                    to_id: (await supabase.auth.getUser()).data.user?.id
                });
            } else {
                await friendsApi.sendRequest(id);
            }
            await refetch();
        } catch (error: any) {
            Alert.alert("Error", error.message);
        } finally {
            setSending(false);
        }
    };

    const handleReportUser = async () => {
        const reason = await promptReportReason("Report User", `Why are you reporting @${username}?`);
        if (!reason) return;
        try {
            await reportsApi.submitReport({ targetUserId: id, reason });
            Alert.alert("Report received", "Thanks. Our team reviews reports within 24 hours.");
        } catch (error: any) {
            if (error.message === "AlreadyReported") {
                Alert.alert("Note", "You have already reported this user.");
            } else {
                Alert.alert("Error", "The report could not be sent. Please try again later.");
            }
        }
    };

    return {
        sending,
        handleCopyUsername,
        handleSeverConnection,
        handleBlockUser,
        handleUnblockUser,
        handleConnectAction,
        handleReportUser,
    };
}