import React from 'react';
import { Text, TouchableOpacity, View } from "react-native";

import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";

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

        //  Actions
        handleDelete,
        handleReportPost
    } = usePost(post, onDelete)

    return (
        <View style={styles.cardContainer}>
            <View style={styles.mainCard}>
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.userInfo}
                        onPress={() => {
                            if (isOwner) {
                                router.push("/(app)/(tabs)/(profile)");
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

                {/* 🟢 CONTENIDO UNIFICADO: Texto y Media pueden coexistir */}
                <View style={styles.contentContainer}>
                    {postText ? (
                        <View style={styles.textFrame}>
                            <Text style={styles.bodyText}>{postText}</Text>
                        </View>
                    ) : null}

                    {/* Si hay media (imagen/video), la mostramos debajo del texto */}
                    {isMedia && mediaUrl ? (
                        <View style={styles.mediaFrame}>
                            <Image
                                source={{ uri: mediaUrl }}
                                style={styles.image}
                                contentFit="cover"
                                transition={400}
                            />
                        </View>
                    ) : null}
                </View>

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