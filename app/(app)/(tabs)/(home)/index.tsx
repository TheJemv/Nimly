import { useCallback, useEffect, useRef, useState } from "react";
import {
   ActivityIndicator,
   RefreshControl,
   ScrollView,
   StyleSheet,
   TouchableOpacity,
   View
} from "react-native";

import { Host } from "@expo/ui/swift-ui";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { router, Stack } from "expo-router";
import { SymbolView } from "expo-symbols";

import { getFriendsPosts } from "@/api/posts";

import CommentsSheet from "@/components/CommentsSheet";
import PostComponent from "@/components/PostComponent";

import StoriesDaily from "@/components/StoriesDaily";
import { Colors, getThemeColor } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useStoriesFeed } from "@/hooks/useStoriesFeed";

export default function HomeScreen() {
   const { session } = useAuth()

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
      const userId = session?.user?.id;
      if (!userId) return; // 👈 sin sesión, no cargamos nada
      const t0 = performance.now();
      try {
         const postsData = await getFriendsPosts(userId);
         const t1 = performance.now();
         console.log(`⏱️ [Home] getFriendsPosts() (${postsData?.length ?? 0} posts): ${(t1 - t0).toFixed(0)}ms`);
         setPosts(postsData || []);
      } catch (err) {
         console.error("Error cargando posts:", err);
      } finally {
         setLoadingPosts(false);
         setRefreshing(false);
      }
   };

   const mountTimeRef = useRef<number>(performance.now());
   const hasLoggedInitialLoad = useRef(false);

   useEffect(() => {
      console.log("🔑 Session al montar HomeScreen:", session?.access_token ? "presente" : "AUSENTE", session?.user?.id);
      loadPosts();
   }, [session]);

   useEffect(() => {
      if (hasLoggedInitialLoad.current) return;
      if (!loadingPosts && !loadingStories) {
         hasLoggedInitialLoad.current = true;
         const elapsed = performance.now() - mountTimeRef.current;
         console.log(`⏱️ [Home] TIEMPO TOTAL HASTA PANTALLA LISTA (posts + stories): ${elapsed.toFixed(0)}ms`);
      }
   }, [loadingPosts, loadingStories]);

   const onRefresh = useCallback(async () => {
      setRefreshing(true);
      const t0 = performance.now();
      await Promise.all([loadPosts(false), reloadStories(false)]);
      console.log(`⏱️ [Home] onRefresh() total: ${(performance.now() - t0).toFixed(0)}ms`);
   }, [reloadStories]);

   const isInitialLoading = loadingPosts && loadingStories && !refreshing;
   return (
      <View style={styles.container}>
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

         {/* {isInitialLoading ? (
            <View style={styles.loaderContainer}>
               <ActivityIndicator size="large" color={getThemeColor("tint")} />
            </View>
         ) : ( */}
         <ScrollView
            showsVerticalScrollIndicator={false}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ paddingBottom: 120, paddingTop: 12 }}
            refreshControl={
               <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={getThemeColor("tint")} />
            }
         >
            <View style={styles.feed}>
               {loadingStories ? (
                  <View style={{
                     backgroundColor: "transparent",
                     paddingVertical: 12,
                     borderBottomWidth: 0,
                     borderBottomColor: Colors.dark.glassBorder,
                     minHeight: 110,
                     display: "flex",
                     justifyContent: "center",
                     alignContent: "center"
                  }}>
                     <ActivityIndicator size={"large"} color={getThemeColor("tint")} />
                  </View>
               ) : (
                  <StoriesDaily
                     storyGroups={storyGroups}
                     currentUserId={currentUserId}
                     onStorySeen={handleStorySeen}
                     onStoryLiked={handleStoryLiked}
                     onSendStory={handleSendStory}
                     onStoryDeleted={handleStoryDeleted}
                  />
               )}

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
         {/* )} */}

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