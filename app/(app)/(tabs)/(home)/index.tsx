import { getFriendsPosts } from "@/api/posts";
import CommentsSheet from "@/components/comments-sheet";
import PostComponent from "@/components/post";
import { supabase } from "@/lib/supabase";
import { Host } from "@expo/ui/swift-ui";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { router, Stack } from "expo-router";
import { SymbolView } from 'expo-symbols';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
   ActivityIndicator,
   RefreshControl,
   ScrollView,
   StyleSheet,
   TouchableOpacity,
   View
} from 'react-native';

export default function HomeScreen() {
   const [posts, setPosts] = useState<any[]>([]);
   const [loading, setLoading] = useState(true);
   const [refreshing, setRefreshing] = useState(false);

   const commentsRef = useRef<BottomSheetModal>(null); // Referencia única
   const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
   const [isCommentsOpen, setIsCommentsOpen] = useState(false);

   const handleOpenComments = (postId: string) => {
      setActiveCommentPostId(postId);
      commentsRef.current?.present(); // ¡Directo y sin estados de error!
   };

   const loadPosts = async (showLoading = true) => {
      if (showLoading) setLoading(true);
      try {
         // CAMBIAMOS ESTO:
         const data = await getFriendsPosts();
         setPosts(data || []);
      } catch (error) {
         console.error("Error al cargar posts:", error);
      } finally {
         if (showLoading) setLoading(false);
         setRefreshing(false);
      }
   };

   useEffect(() => {
      loadPosts();

      // --- CONFIGURACIÓN REALTIME SÓLO PARA POSTS ---
      const channel = supabase
         .channel('public:posts')
         .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'posts' },
            () => {
               // Cuando hay un cambio en la tabla posts, recargamos para ver lo nuevo
               loadPosts(false);
            }
         )
         .subscribe();

      return () => {
         supabase.removeChannel(channel);
      };
   }, []);

   const onRefresh = useCallback(() => {
      setRefreshing(true);
      loadPosts(false);
   }, []);

   return (
      <>

         <View style={styles.container}>
            <Stack.Screen
               options={{
                  headerShown: true,
                  headerTitle: 'Nimly',
                  headerTitleAlign: 'left',
                  headerStyle: { backgroundColor: 'transparent' },
                  headerTintColor: '#fff',
                  headerTitleStyle: { color: '#fff', fontWeight: '700', fontSize: 22 },
                  headerLeft: () => (
                     <TouchableOpacity onPress={() => router.push("/(app)/new-post")}>
                        <SymbolView name='plus' size={24} tintColor='#fff' />
                     </TouchableOpacity>
                  ),
                  headerRight: () => (
                     <TouchableOpacity onPress={() => router.push("/notifications")}>
                        <SymbolView name='bell' size={24} tintColor='#fff' />
                     </TouchableOpacity>
                  ),
                  headerTransparent: true,
                  headerShadowVisible: false,
               }}
            />
            <ScrollView
               showsVerticalScrollIndicator={false}
               contentInsetAdjustmentBehavior='automatic'
               contentContainerStyle={{ paddingBottom: 120, paddingTop: 12 }} // Agregado paddingTop para el header transparente
               refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
               }
            >
               <View style={styles.feed}>
                  {loading && !refreshing ? (
                     <View style={styles.loaderContainer}>
                        <ActivityIndicator color="#fff" size="large" />
                     </View>
                  ) : (
                     posts.map((post) => (
                        <PostComponent
                           post={post}
                           key={post.id}
                           onDelete={() => loadPosts(false)}
                           onCommentPress={() => handleOpenComments(post.id)}
                        />
                     ))
                  )}

                  {!loading && posts.length === 0 && (
                     <View style={styles.emptyContainer}>
                        <SymbolView name="tray" size={40} tintColor="rgba(255,255,255,0.2)" />
                     </View>
                  )}
               </View>
            </ScrollView>
         </View>

         {activeCommentPostId && (
            <Host>
               <CommentsSheet
                  ref={commentsRef}
                  postId={activeCommentPostId}
                  postOwnerId={posts.find(p => p.id === activeCommentPostId)?.user_id}
               />
            </Host>
         )}
      </>
   );
}

const styles = StyleSheet.create({
   container: { flex: 1, backgroundColor: '#000000' },
   bgGlowImage: { position: 'absolute', top: 0, left: -40, width: 500, height: "100%", opacity: 1, zIndex: 0 },
   feed: { paddingHorizontal: 16, zIndex: 1 },
   loaderContainer: { marginTop: 100, alignItems: 'center' },
   emptyContainer: { alignItems: 'center', marginTop: 100, opacity: 0.5 }
});