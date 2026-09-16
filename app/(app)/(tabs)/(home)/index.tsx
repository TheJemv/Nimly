import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
   ActivityIndicator,
   FlatList,
   RefreshControl,
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
import { isVideoPath } from "@/components/PostComponent/hooks/usePost";

import StoriesDaily from "@/components/StoriesDaily";
import { prefetchHls } from "@/utils/videoSource";
import { getThemeColor } from "@/constants/theme";
import { useAppReady } from "@/context/AppReadyContext";
import { useAuth } from "@/context/AuthContext";
import { useBlockedUsers } from "@/context/BlockedUsersContext";
import { useStoriesFeed } from "@/hooks/useStoriesFeed";

export default function HomeScreen() {
   const { session } = useAuth()
   const { markHomeReady } = useAppReady();
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
      uploadingStory,
      handleStoryDeleted
   } = useStoriesFeed();

   const commentsRef = useRef<BottomSheetModal>(null);
   const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);

   // Only the "most visible" video post on screen plays at a time (Instagram/
   // TikTok style) -- the rest stay paused. Mute is shared across the whole
   // feed: unmuting one leaves all of them unmuted as they come into view.
   const [activeVideoPostId, setActiveVideoPostId] = useState<string | null>(null);
   const [feedMuted, setFeedMuted] = useState(true);
   const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
   const onViewableItemsChanged = useRef(
      ({ viewableItems }: { viewableItems: { item: any; isViewable: boolean }[] }) => {
         const winner = viewableItems.find((v) => v.isViewable && isVideoPath(v.item?.media_url || ''));
         setActiveVideoPostId(winner?.item?.id ?? null);
      }
   ).current;

   const loadPosts = useCallback(async (showLoading = true) => {
      if (showLoading) setLoadingPosts(true);
      const userId = session?.user?.id;
      if (!userId) { setLoadingPosts(false); return; } // no session, nothing to load
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

   // Lets the root layout know it can reveal the app: without this, the
   // splash would disappear as soon as auth resolved, and the user would
   // briefly see the posts/stories spinners loading separately.
   useEffect(() => {
      if (!loadingPosts && !loadingStories) markHomeReady();
   }, [loadingPosts, loadingStories, markHomeReady]);

   const onRefresh = useCallback(async () => {
      setRefreshing(true);
      await Promise.all([loadPosts(false), reloadStories(false)]);
   }, [reloadStories, loadPosts]);

   // Instantly hides content from blocked users (Guideline 1.2).
   const visiblePosts = useMemo(
      () => posts.filter((p) => !isBlocked(p.user_id)),
      [posts, isBlocked, blockedIds],
   );
   const visibleStoryGroups = useMemo(
      () => storyGroups.filter((g) => g.is_me || !isBlocked(g.user_id)),
      [storyGroups, isBlocked, blockedIds],
   );

   // Prefetch: warms up HLS for the first video posts in the feed (auth +
   // segment signing + TLS to both hosts) so the first one you see starts
   // without the ~0.8s cold-start. Best-effort, once per post.
   useEffect(() => {
      const token = session?.access_token;
      if (!token) return;
      visiblePosts
         .filter((p) => p.playback_status === "ready" && isVideoPath(p.media_url || ""))
         .slice(0, 3)
         .forEach((p) => { prefetchHls({ id: p.id, ownerId: p.user_id, playbackStatus: p.playback_status }, token); });
   }, [visiblePosts, session?.access_token]);

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

         {/* A single loader for the whole feed: before, two spinners showed at
             once (one for stories, one for posts). While either one is doing
             its FIRST load, we show just one, centered. */}
         {loadingStories || loadingPosts ? (
            <View style={styles.loaderContainer}>
               <ActivityIndicator size="large" color={getThemeColor("tint")} />
            </View>
         ) : (
            <FlatList
               data={visiblePosts}
               keyExtractor={(post) => post.id}
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
               // Decides which video post "wins" and plays -- see the
               // activeVideoPostId/feedMuted state above.
               viewabilityConfig={viewabilityConfig}
               onViewableItemsChanged={onViewableItemsChanged}
               ListHeaderComponent={
                  <View style={styles.storiesWrap}>
                     <StoriesDaily
                        storyGroups={visibleStoryGroups}
                        currentUserId={currentUserId}
                        uploadingStory={uploadingStory}
                        onStorySeen={handleStorySeen}
                        onStoryLiked={handleStoryLiked}
                        onSendStory={handleSendStory}
                        onStoryDeleted={handleStoryDeleted}
                     />
                  </View>
               }
               renderItem={({ item: post }) => (
                  <PostComponent
                     post={post}
                     isActive={post.id === activeVideoPostId}
                     muted={feedMuted}
                     onToggleMute={() => setFeedMuted((m) => !m)}
                     onDelete={() => loadPosts(false)}
                     onCommentPress={() => {
                        setActiveCommentPostId(post.id);
                        commentsRef.current?.present();
                     }}
                  />
               )}
            />
         )}
         {/* )} */}

         {/*
            This used to be mounted only when activeCommentPostId existed, so on
            the first tap the ref was still null (the component didn't exist yet)
            and .present() did nothing -- you had to tap "comments" twice. Always
            mounted, the ref exists from the very first render.
         */}
         <Host>
            <CommentsSheet
               ref={commentsRef}
               postId={activeCommentPostId}
               postOwnerId={posts.find((p) => p.id === activeCommentPostId)?.user_id}
            />
         </Host>
      </View>
   );
}

const styles = StyleSheet.create({
   container: { flex: 1, backgroundColor: "#000000" },
   // This spacing used to come from the `gap: 12` on the View that wrapped
   // the whole feed in the old ScrollView -- FlatList doesn't wrap items that
   // way, and the spacing between posts is already handled by PostComponent's
   // own marginBottom.
   storiesWrap: { marginBottom: 12 },
   loaderContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
   },
});