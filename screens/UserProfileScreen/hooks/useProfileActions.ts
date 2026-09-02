import { blocksApi } from '@/api/blocks';
import { friendsApi } from '@/api/friends';
import { reportsApi } from '@/api/reports';
import { supabase } from '@/lib/supabase';
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

    const handleCopyUsername = async () => {
        if (username) {
            await Clipboard.setStringAsync(`@${username}`);
            Alert.alert("Link Copied", "Username stored in your secure vault.");
        }
    };

    const handleSeverConnection = () => {
        Alert.alert(
            "Sever Connection",
            `This will terminate all encrypted access with @${username}. Are you sure?`,
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
                        try {
                            setLoading(true);
                            await blocksApi.blockUser(id);
                            await refetch();
                        } catch (e: any) {
                            if (e.message === "AlreadyBlocked") {
                                Alert.alert("Note", "You have already blocked this user.");
                            } else {
                                Alert.alert("Error", "Action could not be completed.");
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
                        try {
                            setLoading(true);
                            await blocksApi.unblockUser(id);
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
            refetch();
        } catch (error: any) {
            Alert.alert("Error", error.message);
        } finally {
            setSending(false);
        }
    };

    const handleReportUser = async () => {
        try {
            await reportsApi.submitReport({ targetUserId: id, reason: 'harassment' });
            Alert.alert("Report Filed", "Our security protocols have logged your report.");
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