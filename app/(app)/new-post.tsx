import { createPost } from "@/api/posts";
import NymlyCamera from "@/components/NymlyCamera";
import { ESTILOS_DICEBEAR } from "@/constants/dicebear";
import { getThemeColor } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { createAvatar } from "@dicebear/core";

import { GlassView } from "expo-glass-effect";
import * as ImagePicker from "expo-image-picker";
import { Stack, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";

import React, { useEffect, useMemo, useState } from "react";
import {
   ActivityIndicator,
   Alert,
   Image,
   KeyboardAvoidingView,
   Pressable,
   ScrollView,
   StyleSheet,
   Text,
   TextInput,
   TouchableOpacity,
   View
} from "react-native";
import Animated, { useAnimatedStyle, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";

export default function NewPostScreen() {
   const router = useRouter();
   const insets = useSafeAreaInsets();
   const [activeTab, setActiveTab] = useState<'text' | 'media'>('text');
   const [text, setText] = useState("");
   const [media, setMedia] = useState<{ uri: string; type: string } | null>(null);
   const [isPosting, setIsPosting] = useState(false);
   const [userProfile, setUserProfile] = useState<any>(null);
   const [isCameraVisible, setCameraVisible] = useState(false);

   const tintColor = getThemeColor("tint");
   const canPost = ((activeTab === 'text' && text.trim().length > 0) || (activeTab === 'media' && media)) && !isPosting;

   // 1. CARGA DE PERFIL
   useEffect(() => {
      async function getAvatar() {
         const { data: { user } } = await supabase.auth.getUser();
         if (user) {
            const { data } = await supabase.from('profiles').select('avatar_config').eq('id', user.id).single();
            setUserProfile(data);
         }
      }
      getAvatar();
   }, []);

   const userAvatarSvg = useMemo(() => {
      if (!userProfile?.avatar_config) return null;
      const config = userProfile.avatar_config;
      const estilo = ESTILOS_DICEBEAR.find(e => e.id === config.styleId) || ESTILOS_DICEBEAR[0];
      return createAvatar(estilo.collection, { ...config.options, radius: 50 }).toString();
   }, [userProfile]);

   // 2. LÓGICA DE PERMISOS Y MULTIMEDIA (EL FIX)
   const pickMedia = async () => {
      try {
         const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
         if (status !== 'granted') {
            Alert.alert("Permiso Denegado", "Nymly necesita acceso a tus fotos para continuar.");
            return;
         }

         const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            allowsEditing: true,
            quality: 0.8,
         });

         if (!result.canceled) {
            setText("");
            setMedia({ uri: result.assets[0].uri, type: result.assets[0].type || 'image' });
         }
      } catch (e) {
         console.error("Error picking media:", e);
         Alert.alert("Error", "No se pudo abrir la galería.");
      }
   };

   const takePhoto = async () => {
      try {
         const { status } = await ImagePicker.requestCameraPermissionsAsync();
         if (status !== 'granted') {
            Alert.alert("Permiso Denegado", "Nymly necesita acceso a la cámara para capturar el momento.");
            return;
         }

         const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            quality: 0.8,
         });

         if (!result.canceled) {
            setText("");
            setMedia({ uri: result.assets[0].uri, type: 'image' });
         }
      } catch (e) {
         console.error("Error taking photo:", e);
         Alert.alert("Error", "No se pudo activar la cámara.");
      }
   };

   // 3. ANIMACIONES Y POST
   const pillStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: withSpring(activeTab === 'text' ? 0 : 90, { damping: 18, stiffness: 150 }) }],
   }));

   const handlePost = async () => {
      if (!canPost) return;
      setIsPosting(true);
      try {
         const { data: { user } } = await supabase.auth.getUser();
         await createPost(user!.id, text, media || undefined);
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
            headerTitle: "Vault Entry",
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
                     <Text style={[styles.postBtnText, { color: canPost ? tintColor : '#3A3A3C' }]}>Post</Text>}
               </TouchableOpacity>
            ),
         }} />

         <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={90}>
            <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>

               {/* SELECTOR LIQUID GLASS */}
               <View style={styles.selectorWrapper}>
                  <GlassView style={styles.liquidGlass}>
                     <Animated.View style={[styles.activePill, pillStyle, { backgroundColor: tintColor }]} />
                     <TouchableOpacity style={styles.tabItem} onPress={() => { setActiveTab('text'); setMedia(null); }}>
                        <SymbolView name="text.justify.left" size={16} tintColor={activeTab === 'text' ? "#FFF" : "#636366"} />
                     </TouchableOpacity>
                     <TouchableOpacity style={styles.tabItem} onPress={() => { setActiveTab('media'); setText(""); }}>
                        <SymbolView name="play.square.stack" size={16} tintColor={activeTab === 'media' ? "#FFF" : "#636366"} />
                     </TouchableOpacity>
                  </GlassView>
               </View>

               {activeTab === 'text' ? (
                  <View style={styles.inputArea}>
                     <View style={styles.avatarCol}>
                        {userAvatarSvg ? <SvgXml xml={userAvatarSvg} width="40" height="40" /> : <View style={styles.avatarPlaceholder} />}
                     </View>
                     <View style={styles.contentCol}>
                        <TextInput
                           style={styles.textInput}
                           placeholder="What's your secret?"
                           placeholderTextColor="#3A3A3C"
                           multiline
                           autoFocus
                           value={text}
                           onChangeText={setText}
                           selectionColor={tintColor}
                        />
                     </View>
                  </View>
               ) : (
                  <View style={styles.mediaViewWrapper}>
                     {!media ? (
                        <View style={styles.mediaPlaceholderCentered}>
                           <TouchableOpacity style={styles.mediaOption} onPress={() => setCameraVisible(true)}>
                              <SymbolView name="camera.fill" size={28} tintColor={tintColor} />
                           </TouchableOpacity>
                           <TouchableOpacity style={styles.mediaOption} onPress={pickMedia}>
                              <SymbolView name="photo.fill" size={28} tintColor={tintColor} />
                           </TouchableOpacity>
                        </View>
                     ) : (
                        <View style={styles.previewFullWidth}>
                           <Image source={{ uri: media.uri }} style={styles.mediaPreview} />
                           <TouchableOpacity style={styles.removeBtn} onPress={() => setMedia(null)}>
                              <SymbolView name="trash.fill" size={14} tintColor="#FFF" />
                           </TouchableOpacity>
                        </View>
                     )}
                  </View>
               )}
            </ScrollView>
         </KeyboardAvoidingView>

         {/* 👇 NUEVO: cámara in-app reusada */}
         <NymlyCamera
            visible={isCameraVisible}
            onClose={() => setCameraVisible(false)}
            simpleMode // sin panel de View Once, solo "Use Photo"
            onSend={(uri) => {
               setText("");
               setMedia({ uri, type: 'image' });
            }}
         />
      </View>
   );
}

const styles = StyleSheet.create({
   mainWrapper: { flex: 1, backgroundColor: "#000" },
   headerBtn: { padding: 10 },
   postBtnText: { fontWeight: "700", fontSize: 16 },
   selectorWrapper: { alignItems: 'center', marginVertical: 20 },
   liquidGlass: { flexDirection: 'row', width: 180, height: 40, borderRadius: 20, padding: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
   activePill: { position: 'absolute', top: 4, left: 4, width: 82, height: 32, borderRadius: 16 },
   tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
   inputArea: { flexDirection: 'row', paddingHorizontal: 20, gap: 12 },
   avatarCol: { width: 40 },
   avatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1C1C1E' },
   contentCol: { flex: 1 },
   textInput: { color: "#fff", fontSize: 19, lineHeight: 26, minHeight: 200, textAlignVertical: "top" },
   mediaViewWrapper: { paddingHorizontal: 20, minHeight: 400, justifyContent: 'center' },
   mediaPlaceholderCentered: { flexDirection: 'row', gap: 16, justifyContent: 'center', alignItems: 'center' },
   mediaOption: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
   previewFullWidth: { width: '100%', height: 350, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
   mediaPreview: { width: '100%', height: '100%', resizeMode: 'cover' },
   removeBtn: { position: 'absolute', top: 12, right: 12, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,69,58,0.8)', alignItems: 'center', justifyContent: 'center' }
});