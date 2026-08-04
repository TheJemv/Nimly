import { deletePost, toggleLike } from "@/api/posts";
import { reportsApi } from "@/api/reports";
import { ESTILOS_DICEBEAR } from "@/constants/dicebear";
import { getThemeColor } from "@/constants/theme";
import { supabase, supabaseUrl } from "@/lib/supabase";
import { createAvatar } from "@dicebear/core";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import React, { useEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SvgXml } from "react-native-svg";

// Cambia tu import de 'expo-router' (si es que tenías uno, si no, agrégalo)
import { useRouter } from "expo-router";

interface Props {
   post: any;
   onDelete?: () => void;
   onCommentPress?: () => void;
}

export default function PostComponent({ post, onDelete, onCommentPress }: Props) {
   const router = useRouter();

   const [currentUserId, setCurrentUserId] = useState<string | null>(null);
   const [sessionToken, setSessionToken] = useState<string | null>(null);

   const [likesCount, setLikesCount] = useState(post.likes_count || 0);
   const [isLiked, setIsLiked] = useState(post.is_liked_by_me || false);

   // Los comentarios ahora vienen como post.comments_count según tu log
   const [commentsCount, setCommentsCount] = useState(post.comments_count || 0);

   const accentColor = getThemeColor("tint") || "#007AFF";

   useEffect(() => {
      supabase.auth.getSession().then(({ data }) => {
         setCurrentUserId(data.session?.user?.id || null);
         setSessionToken(data.session?.access_token || null);
      });
   }, []);

   useEffect(() => {
      setLikesCount(post.likes_count || 0);
      setIsLiked(post.is_liked_by_me || false);
      setCommentsCount(post.comments_count || 0);
   }, [post.likes_count, post.is_liked_by_me, post.comments_count]);

   const handleLike = async () => {
      const prevLiked = isLiked;
      const prevCount = likesCount;
      setIsLiked(!isLiked);
      setLikesCount(prev => isLiked ? prev - 1 : prev + 1);

      try {
         await toggleLike(post.id);
      } catch (error) {
         setIsLiked(prevLiked);
         setLikesCount(prevCount);
      }
   };

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

   const isOwner = currentUserId === post.user_id;
   const isMedia = post.type === 'IMAGE' || post.type === 'VIDEO';
   const mediaUrl = isMedia && post.content
      ? `${supabaseUrl}/storage/v1/object/authenticated/media/${post.content}`
      : null;

   const postText = post.type === 'TEXT' ? post.content : '';
   const date = new Date(post.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });

   // --- AQUÍ ESTÁ EL CAMBIO CRUCIAL SEGÚN TU LOG ---
   const username = post.username || 'Usuario'; // Antes era post.user?.username

   const avatarSvg = useMemo(() => {
      const config = post.avatar_config; // Antes era post.user?.avatar_config
      if (!config || !config.styleId) return null;
      try {
         const estilo = ESTILOS_DICEBEAR.find(e => e.id === config.styleId) || ESTILOS_DICEBEAR[0];
         return createAvatar(estilo.collection, { ...config.options, radius: 50 }).toString();
      } catch (e) { return null; }
   }, [post.avatar_config]);

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
                     if (currentUserId && post.user_id === currentUserId) {
                        router.push("/(app)/(tabs)/(profile)"); // 👈 Cambia esto por tu ruta de perfil personal si es diferente
                     } else {
                        router.push(`/(app)/user/${post.user_id}`);
                     }
                  }}
                  activeOpacity={0.7}
               >
                  <View style={styles.avatarBorder}>
                     <View style={styles.avatarInner}>
                        {avatarSvg ? <SvgXml xml={avatarSvg} width="100%" height="100%" /> : <View style={styles.avatarPlaceholder} />}
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
                     tintColor={isLiked ? accentColor : "#636366"}
                  />
                  <Text style={[styles.interactionText, isLiked && { color: accentColor }]}>
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

const styles = StyleSheet.create({
   cardContainer: { marginBottom: 20, paddingHorizontal: 4 },
   mainCard: { backgroundColor: '#050505', borderRadius: 28, borderWidth: 1, borderColor: '#1C1C1E', overflow: 'hidden' },
   header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
   userInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
   avatarBorder: { width: 44, height: 44, borderRadius: 22, padding: 1.5, backgroundColor: '#1C1C1E' },
   avatarInner: { flex: 1, borderRadius: 21, backgroundColor: '#000', overflow: 'hidden' },
   avatarPlaceholder: { flex: 1, backgroundColor: '#1C1C1E' },
   usernameText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', letterSpacing: -0.4 },
   dateText: { color: '#636366', fontSize: 12, marginTop: 1 },
   moreAction: { padding: 4 },
   textFrame: { paddingHorizontal: 20, paddingBottom: 20 },
   bodyText: { color: '#EBEBF5', fontSize: 17, lineHeight: 25, letterSpacing: -0.2 },
   mediaFrame: { width: '100%', aspectRatio: 1, backgroundColor: '#000' },
   image: { width: '100%', height: '100%' },
   footer: { flexDirection: 'row', padding: 12, gap: 8, borderTopWidth: 0.5, borderTopColor: '#1C1C1E' },
   interactionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
   activeBtn: { backgroundColor: 'rgba(255,255,255,0.03)' },
   interactionText: { color: '#636366', fontSize: 14, fontWeight: '600' },
});