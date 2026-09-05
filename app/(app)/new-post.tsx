import { createPost } from "@/api/posts";
import NymlyCamera from "@/components/NymlyCamera";
import { getThemeColor } from "@/constants/theme";

import * as ImagePicker from "expo-image-picker";
import { Stack, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useVideoPlayer, VideoView } from "expo-video";

import { useState } from "react";
import {
   ActivityIndicator,
   Alert,
   Image,
   KeyboardAvoidingView,
   Platform,
   Pressable,
   ScrollView,
   StyleSheet,
   Text,
   TextInput,
   TouchableOpacity,
   View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TINT = getThemeColor("tint");
const SURFACE = getThemeColor("surface");
const TEXT_SECONDARY = getThemeColor("textSecondary");
const ICON = getThemeColor("icon");

// 1. 👇 Importamos tus contextos
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";

export default function NewPostScreen() {
   const router = useRouter();
   const insets = useSafeAreaInsets();

   const { session } = useAuth();

   const [text, setText] = useState("");
   const [media, setMedia] = useState<{ uri: string; type: 'image' | 'video' } | undefined>(undefined);
   const [isPosting, setIsPosting] = useState(false);
   const [isCameraVisible, setCameraVisible] = useState(false);

   const tintColor = getThemeColor("tint");
   const MAX_CHARS = 128;

   const isOverLimit = text.length > MAX_CHARS;
   const canPost = (text.trim().length > 0 || !!media) && !isPosting;

   const previewPlayer = useVideoPlayer(media?.type === 'video' ? media.uri : null, (p) => {
      p.loop = true;
      p.play();
   });

   // LÓGICA DE PERMISOS Y MULTIMEDIA
   const pickMedia = async () => {
      try {
         const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
         if (status !== 'granted') {
            Alert.alert("Permission Denied", "Nimly needs access to your photos to continue.");
            return;
         }

         const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            allowsEditing: true,
            quality: 0.8,
            // Por default (`Passthrough`) el video se sube exactamente como
            // está en la fototeca -- si se grabó con la Cámara nativa (que
            // trae HDR prendido de fábrica), ese HDR se sube intacto y se ve
            // "lavado"/con más brillo al reproducirlo. Forzar un preset real
            // re-codifica a H.264/AAC estándar (SDR), igual que ya sale de
            // nuestra propia cámara en la app.
            videoExportPreset: ImagePicker.VideoExportPreset.HighestQuality,
         });

         if (!result.canceled) {
            const assetType = result.assets[0].type;
            const safeType = assetType === 'video' ? 'video' : 'image';
            setMedia({ uri: result.assets[0].uri, type: safeType });
         }
      } catch (e) {
         console.error("Error picking media:", e);
         Alert.alert("Error", "Could not open gallery.");
      }
   };

   // NORMALIZACIÓN DE TEXTO
   const handleTextChange = (inputText: string) => {
      const cleanedText = inputText
         .replace(/[\r\n]+/g, '. ')
         .replace(/\s+/g, ' ');

      setText(cleanedText);
   };

   // ACCIÓN DE POST
   const handlePost = async () => {
      if (!canPost || !session?.user?.id) return;

      if (text.length > MAX_CHARS) {
         Alert.alert("Character limit exceeded", `Your post has ${text.length} characters, but the maximum allowed is ${MAX_CHARS}.`);
         return;
      }

      setIsPosting(true);
      try {
         const finalCleanText = text.trim();
         // 4. 👇 Usamos el session.user.id directamente
         await createPost(session.user.id, finalCleanText, media);
         router.back();
      } catch (error: any) {
         Alert.alert("Error", error.message);
      } finally {
         setIsPosting(false);
      }
   };

   return (
      <View style={styles.mainWrapper}>
         <Stack.Screen options={{
            headerShown: true,
            headerTitle: "New Post",
            headerShadowVisible: false,
            headerStyle: { backgroundColor: "#000" },
            headerTintColor: "#fff",
            animation: 'slide_from_left',
            headerLeft: () => (
               <Pressable onPress={() => router.back()} style={styles.headerBtn}>
                  <SymbolView name="xmark" size={18} tintColor="#fff" />
               </Pressable>
            ),
            headerRight: () => (
               <TouchableOpacity onPress={handlePost} disabled={!canPost} style={styles.headerBtn}>
                  {isPosting ? <ActivityIndicator size="small" color={tintColor} /> :
                     <Text style={[styles.postBtnText, { color: canPost ? tintColor : ICON }]}>Post</Text>}
               </TouchableOpacity>
            ),
         }} />

         <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
         >
            <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 20, paddingHorizontal: 20, paddingTop: 16 }}>

               <View style={styles.inputArea}>
                  <View style={styles.avatarCol}>
                     <UserAvatar />
                  </View>
                  <View style={styles.contentCol}>
                     <TextInput
                        style={styles.textInput}
                        placeholder="What is happening?!"
                        placeholderTextColor={ICON}
                        multiline
                        autoFocus
                        value={text}
                        onChangeText={handleTextChange}
                        selectionColor={tintColor}
                     />


                     {media && (
                        <View style={styles.previewContainer}>
                           {media.type === 'video' ? (
                              <VideoView player={previewPlayer} style={styles.mediaPreview} nativeControls={false} contentFit="cover" />
                           ) : (
                              <Image source={{ uri: media.uri }} style={styles.mediaPreview} />
                           )}
                           <TouchableOpacity style={styles.removeBtn} onPress={() => setMedia(undefined)}>
                              <SymbolView name="xmark" size={12} tintColor="#FFF" />
                           </TouchableOpacity>
                        </View>
                     )}
                  </View>
               </View>

            </ScrollView>

            <View style={[styles.bottomToolbar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
               <View style={styles.toolbarIcons}>
                  <TouchableOpacity style={styles.toolIconBtn} onPress={() => setCameraVisible(true)}>
                     <SymbolView name="camera" size={22} tintColor={tintColor} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.toolIconBtn} onPress={pickMedia}>
                     <SymbolView name="photo" size={22} tintColor={tintColor} />
                  </TouchableOpacity>
               </View>

               <Text style={[styles.counterText, isOverLimit && styles.counterError]}>
                  {text.length}/{MAX_CHARS}
               </Text>
            </View>
         </KeyboardAvoidingView>

         <NymlyCamera
            visible={isCameraVisible}
            onClose={() => setCameraVisible(false)}
            mode="simple"
            onSend={(uri, type) => {
               setMedia({ uri, type });
            }}
         />
      </View>
   );
}

const styles = StyleSheet.create({
   mainWrapper: { flex: 1, backgroundColor: "#000" },
   headerBtn: { padding: 10 },
   postBtnText: { fontWeight: "700", fontSize: 16 },
   inputArea: { flexDirection: 'row', gap: 12 },
   avatarCol: { width: 40 },
   avatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: SURFACE },
   contentCol: { flex: 1 },
   textInput: {
      color: "#fff",
      fontSize: 18,
      lineHeight: 24,
      minHeight: 100,
      textAlignVertical: "top",
      paddingTop: 4
   },
   counterText: {
      color: TEXT_SECONDARY,
      fontSize: 16,
      textAlign: 'right',
      marginTop: 4,
      marginBottom: 8
   },
   counterError: {
      color: TINT,
      fontWeight: '600'
   },
   previewContainer: {
      width: '100%',
      height: 280,
      borderRadius: 16,
      overflow: 'hidden',
      marginTop: 4,
      backgroundColor: SURFACE,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)'
   },
   mediaPreview: { width: '100%', height: '100%', resizeMode: 'cover' },
   removeBtn: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)'
   },
   bottomToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingTop: 10,
      borderTopWidth: 0.5,
      borderTopColor: 'rgba(255,255,255,0.1)',
      backgroundColor: '#000',
      justifyContent: "space-between"
   },
   toolbarIcons: {
      flexDirection: 'row',
      gap: 16,
   },
   toolIconBtn: {
      padding: 6,
   }
});