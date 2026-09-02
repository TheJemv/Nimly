import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useBlockedUsers } from "@/context/BlockedUsersContext";
import { useStoriesFeed } from "@/hooks/useStoriesFeed";

export default function HomeScreen() {
   const { session } = useAuth()
   const { blockedIds, isBlocked } = useBlockedUsers();

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

   const loadPosts = useCallback(async (showLoading = true) => {
      if (showLoading) setLoadingPosts(true);
      const userId = session?.user?.id;
      if (!userId) return; // sin sesión, no cargamos nada
      try {
         const postsData = await getFriendsPosts(userId);
         setPosts(postsData || []);
      } catch (err) {
         console.error("Error loading posts:", err);
      } finally {
         setLoadingPosts(false);
         setRefreshing(false);
      }
   }, [session?.user?.id]);

   useEffect(() => {
      loadPosts();
   }, [session, loadPosts]);

   const onRefresh = useCallback(async () => {
      setRefreshing(true);
      await Promise.all([loadPosts(false), reloadStories(false)]);
   }, [reloadStories, loadPosts]);

   // Oculta al instante el contenido de usuarios bloqueados (Guideline 1.2).
   const visiblePosts = useMemo(
      () => posts.filter((p) => !isBlocked(p.user_id)),
      [posts, isBlocked, blockedIds],
   );
   const visibleStoryGroups = useMemo(
      () => storyGroups.filter((g) => g.is_me || !isBlocked(g.user_id)),
      [storyGroups, isBlocked, blockedIds],
   );

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

         <ScrollView
            showsVerticalScrollIndicator={false}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ paddingBottom: 120, paddingTop: 12 }}
            // Without this, a tap on a button inside the Story viewer modal (which
            // lives in this tree) is swallowed to dismiss the keyboard and needs
            // a second tap. See facebook/react-native#28871.
            keyboardShouldPersistTaps="handled"
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
                     storyGroups={visibleStoryGroups}
                     currentUserId={currentUserId}
                     onStorySeen={handleStorySeen}
                     onStoryLiked={handleStoryLiked}
                     onSendStory={handleSendStory}
                     onStoryDeleted={handleStoryDeleted}
                  />
               )}

               {loadingPosts && visiblePosts.length === 0 ? (
                  <ActivityIndicator style={{ marginTop: 40 }} color={getThemeColor("tint")} />
               ) : (
                  visiblePosts.map((post) => (
                     <PostComponent
                        post={post}
                        key={post.id}
                        onDelete={() => loadPosts(false)}
                        onCommentPress={() => {
                           setActiveCommentPostId(post.id);
                           commentsRef.current?.present();
                        }}
                     />
                  ))
               )}
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