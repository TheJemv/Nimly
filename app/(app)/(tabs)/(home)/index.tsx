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
      handleStoryDeleted
   } = useStoriesFeed();

   const commentsRef = useRef<BottomSheetModal>(null);
   const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);

   // Solo el post-video "más visible" en pantalla reproduce a la vez (estilo
   // Instagram/TikTok) -- el resto queda en pausa. El mute es compartido por
   // todo el feed: desmutear uno los deja desmuteados a todos según van
   // entrando en pantalla.
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
      if (!userId) { setLoadingPosts(false); return; } // sin sesión, no cargamos nada
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

   // Le avisa al layout raíz que ya puede destapar la app: sin esto, el
   // splash se quitaba en cuanto auth resolvía y el usuario alcanzaba a ver
   // los spinners de posts/stories cargando por separado.
   useEffect(() => {
      if (!loadingPosts && !loadingStories) markHomeReady();
   }, [loadingPosts, loadingStories, markHomeReady]);

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

         {/* Un solo loader para todo el feed: antes salían dos spinners a la
             vez (uno de stories, otro de posts). Mientras cualquiera de los
             dos hace su PRIMERA carga, mostramos uno solo, centrado. */}
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
               // Decide cuál post-video "gana" y reproduce -- ver los estados
               // activeVideoPostId/feedMuted arriba.
               viewabilityConfig={viewabilityConfig}
               onViewableItemsChanged={onViewableItemsChanged}
               ListHeaderComponent={
                  <View style={styles.storiesWrap}>
                     <StoriesDaily
                        storyGroups={visibleStoryGroups}
                        currentUserId={currentUserId}
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
            Antes esto solo se montaba cuando activeCommentPostId existía, así que
            en el primer tap el ref todavía era null (el componente ni existía) y
            .present() no hacía nada -- había que tocar "comentarios" dos veces.
            Montado siempre, el ref existe desde el primer render.
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
   // Antes este espacio lo daba el `gap: 12` del View que envolvía todo el
   // feed en el ScrollView viejo -- el FlatList no envuelve items así, y el
   // espacio entre posts ya lo da el propio marginBottom de PostComponent.
   storiesWrap: { marginBottom: 12 },
   loaderContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
   },
});