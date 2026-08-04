import { getFriendsPosts } from "@/api/posts";
import BackgroundGlow from "@/components/background-glow";
import CommentsSheet from "@/components/comments-sheet";
import PostComponent from "@/components/post";
import StoriesDaily from "@/components/StoriesDaily";
import { getThemeColor } from "@/constants/theme";
import { useStoriesFeed } from "@/hooks/useStoriesFeed";
import { Host } from "@expo/ui/swift-ui";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { router, Stack } from "expo-router";
import { SymbolView } from "expo-symbols";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
   ActivityIndicator,
   RefreshControl,
   ScrollView,
   StyleSheet,
   TouchableOpacity,
   View,
} from "react-native";

export default function HomeScreen() {
   const [posts, setPosts] = useState<any[]>([]);
   const [loadingPosts, setLoadingPosts] = useState(true);
   const [refreshing, setRefreshing] = useState(false);

   const {
      storyGroups,
      loadingStories,
      currentUserId,
      reloadStories,
      handleStorySeen,
      handleStoryLiked,
      handleSendStory,
      handleStoryDeleted
   } = useStoriesFeed();

   const commentsRef = useRef<BottomSheetModal>(null);
   const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);

   const loadPosts = async (showLoading = true) => {
      if (showLoading) setLoadingPosts(true);
      try {
         const postsData = await getFriendsPosts();
         setPosts(postsData || []);
      } catch (err) {
         console.error("Error cargando posts:", err);
      } finally {
         setLoadingPosts(false);
         setRefreshing(false);
      }
   };

   useEffect(() => {
      loadPosts();
   }, []);

   const onRefresh = useCallback(async () => {
      setRefreshing(true);
      await Promise.all([loadPosts(false), reloadStories(false)]);
   }, [reloadStories]);

   // 🌀 PANTALLA DE CARGA INICIAL
   const isInitialLoading = loadingPosts && loadingStories && !refreshing;

   return (
      <View style={styles.container}>
         <BackgroundGlow />

         <Stack.Screen
            options={{
               headerShown: true,
               headerTitle: "Nimly",
               headerTitleAlign: "left",
               headerStyle: { backgroundColor: "transparent" },
               headerTitleStyle: { color: getThemeColor("text"), fontWeight: "700", fontSize: 22 },
               headerLeft: () => (
                  <TouchableOpacity onPress={() => router.push("/(app)/new-post")}>
                     <SymbolView name="plus" size={24} tintColor="#fff" />
                  </TouchableOpacity>
               ),
               headerRight: () => (
                  <TouchableOpacity onPress={() => router.push("/notifications")}>
                     <SymbolView name="bell" size={24} tintColor="#fff" />
                  </TouchableOpacity>
               ),
               headerTransparent: true,
               headerShadowVisible: false,
            }}
         />

         {isInitialLoading ? (
            /* 👁️ INDICADOR DE CARGA VISIBLE */
            <View style={styles.loaderContainer}>
               <ActivityIndicator size="large" color={getThemeColor("tint")} />
            </View>
         ) : (
            <ScrollView
               showsVerticalScrollIndicator={false}
               contentInsetAdjustmentBehavior="automatic"
               contentContainerStyle={{ paddingBottom: 120, paddingTop: 12 }}
               refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={getThemeColor("tint")} />
               }
            >
               <View style={styles.feed}>
                  <StoriesDaily
                     storyGroups={storyGroups}
                     currentUserId={currentUserId}
                     onStorySeen={handleStorySeen}
                     onStoryLiked={handleStoryLiked}
                     onSendStory={handleSendStory}
                     onStoryDeleted={handleStoryDeleted}
                  />

                  {posts.map((post) => (
                     <PostComponent
                        post={post}
                        key={post.id}
                        onDelete={() => loadPosts(false)}
                        onCommentPress={() => {
                           setActiveCommentPostId(post.id);
                           commentsRef.current?.present();
                        }}
                     />
                  ))}
               </View>
            </ScrollView>
         )}

         {activeCommentPostId && (
            <Host>
               <CommentsSheet
                  ref={commentsRef}
                  postId={activeCommentPostId}
                  postOwnerId={posts.find((p) => p.id === activeCommentPostId)?.user_id}
               />
            </Host>
         )}
      </View>
   );
}

const styles = StyleSheet.create({
   container: { flex: 1, backgroundColor: "#000000" },
   feed: { paddingHorizontal: 0, zIndex: 1, flexDirection: "column", gap: 12 },
   loaderContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
   },
});