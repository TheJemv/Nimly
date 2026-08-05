
import React from 'react';
import { ActionSheetIOS, Alert, Platform, Text, TouchableOpacity, View } from "react-native";

import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";

import { deletePost } from "@/api/posts";
import { reportsApi } from "@/api/reports";
import UserAvatar from "@/components/UserAvatar";
import { getThemeColor } from "@/constants/theme";

import { styles } from "./Post.styles";
import { usePost } from './hooks/usePost';

interface Props {
    post: any;
    onDelete?: () => void;
    onCommentPress?: () => void;
}

export default function PostComponent({ post, onDelete, onCommentPress }: Props) {
    const router = useRouter();
    const {
        //  Likes
        handleLike,
        isLiked,
        likesCount,
        commentsCount,

        //  Media
        isMedia,
        mediaUrl,

        //  Post
        postText,
        date,

        //  Information
        username,
        isOwner,
        sessionToken
    } = usePost(post)


    const handleDelete = () => {
        const performDelete = async () => {
            try {
                await deletePost(post.id, isMedia ? post.content : null);
                if (onDelete) onDelete();
            } catch (e) {
                Alert.alert("Error", "No se pudo eliminar");
            }
        };

        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    options: ['Cancelar', 'Eliminar'],
                    destructiveButtonIndex: 1,
                    cancelButtonIndex: 0,
                    title: '¿Eliminar publicación?',
                },
                (index) => { if (index === 1) performDelete(); }
            );
        } else {
            Alert.alert("Eliminar", "¿Borrar este post?", [
                { text: "Cancelar", style: "cancel" },
                { text: "Eliminar", style: "destructive", onPress: performDelete }
            ]);
        }
    };

    const handleReportPost = (postId: string) => {
        Alert.alert(
            "Report Entry", // Título
            "Are you sure you want to flag this content? Our security protocols will review it shortly.", // Mensaje
            [{
                text: "Cancel",
                style: "cancel", // Estilo estándar de cancelación
            },
            {
                text: "Report",
                style: "destructive", // Este es el truco para que salga en ROJO en iOS
                onPress: async () => {
                    try {
                        await reportsApi.submitReport({
                            targetPostId: postId,
                            reason: 'inappropriate_content' // O el motivo que prefieras
                        });

                        Alert.alert("Success", "Report filed. Access to this content may be restricted soon.");
                    } catch (error: any) {
                        if (error.message === "AlreadyReported") {
                            Alert.alert("Note", "You have already flagged this post.");
                        } else {
                            Alert.alert("Error", "The secure report could not be sent.");
                        }
                    }
                },
            }],
            { cancelable: true }
        );
    };

    return (
        <View style={styles.cardContainer}>
            <View style={styles.mainCard}>
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.userInfo}
                        onPress={() => {
                            if (isOwner) {
                                router.push("/(app)/(tabs)/(profile)"); // 👈 Cambia esto por tu ruta de perfil personal si es diferente
                            } else {
                                router.push(`/(app)/user/${post.user_id}`);
                            }
                        }}
                        activeOpacity={0.7}
                    >
                        <View style={styles.avatarBorder}>
                            <View style={styles.avatarInner}>
                                <UserAvatar
                                    avatar_config={post.avatar_config}
                                    size={40}
                                />
                            </View>
                        </View>
                        <View>
                            <Text style={styles.usernameText}>@{username}</Text>
                            <Text style={styles.dateText}>{date}</Text>
                        </View>
                    </TouchableOpacity>

                    {isOwner ? (
                        <TouchableOpacity onPress={handleDelete} style={styles.moreAction}>
                            <SymbolView name="trash.fill" size={18} tintColor="#48484A" />
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity onPress={async () => await handleReportPost(post.id)} style={styles.moreAction}>
                            <SymbolView name="exclamationmark.triangle.fill" size={18} tintColor="#48484A" />
                        </TouchableOpacity>
                    )}
                </View>

                {isMedia ? (
                    <View style={styles.mediaFrame}>
                        {mediaUrl && sessionToken ? (
                            <Image
                                source={{
                                    uri: mediaUrl,
                                    headers: { Authorization: `Bearer ${sessionToken}` }
                                }}
                                style={styles.image}
                                contentFit="cover"
                                transition={400}
                            />
                        ) : null}
                    </View>
                ) : (
                    <View style={styles.textFrame}>
                        <Text style={styles.bodyText}>{postText}</Text>
                    </View>
                )}

                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.interactionBtn, isLiked && styles.activeBtn]}
                        onPress={handleLike}
                    >
                        <SymbolView
                            name={isLiked ? "heart.fill" : "heart"}
                            size={18}
                            tintColor={isLiked ? getThemeColor("tint") : "#636366"}
                        />
                        <Text style={[styles.interactionText, isLiked && { color: getThemeColor("tint") }]}>
                            {likesCount}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.interactionBtn}
                        onPress={onCommentPress}
                    >
                        <SymbolView name="bubble.right" size={18} tintColor="#636366" />
                        <Text style={styles.interactionText}>{commentsCount}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}