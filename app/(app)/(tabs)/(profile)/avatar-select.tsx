import { ThemedText } from "@/components/themed-text";
import { COLORES_FONDO, ESTILOS_DICEBEAR } from "@/constants/dicebear";
import { getThemeColor } from "@/constants/theme";
import { createAvatar } from "@dicebear/core";
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, FlatList, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { SvgXml } from "react-native-svg";
// Cambiamos SafeAreaView por el de safe-area-context como pide el warning
import { supabase } from "@/lib/supabase";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");
const getValidOptions = (collection: any, category: string) => {
   try {
      const prop = collection.schema.properties[category];
      if (!prop) return [];
      if (prop.items && prop.items.enum) return prop.items.enum;
      if (prop.enum) return prop.enum;
      return [];
   } catch (error) {
      return [];
   }
};

const getDynamicTabs = (collection: any) => {
   const schema = collection.schema.properties;
   const ignore = [
      'seed', 'flip', 'rotate', 'scale', 'radius', 'backgroundColor',
      'backgroundType', 'backgroundRotation', 'translateX', 'translateY', 'clip'
   ];
   return ["style", "backgroundColor", ...Object.keys(schema).filter(key => !ignore.includes(key))];
};

export default function AvatarSelectScreen() {
   const router = useRouter();

   // Estados
   const [loading, setLoading] = useState(true);
   const [activeStyle, setActiveStyle] = useState(ESTILOS_DICEBEAR[0]);
   const [activeTab, setActiveTab] = useState("style");
   const [config, setConfig] = useState({
      backgroundColor: ["DC143C"],
      seed: "user",
   });

   const currentTabs = useMemo(() => getDynamicTabs(activeStyle.collection), [activeStyle]);
   const svgString = useMemo(() => {
      // Verificación de seguridad para evitar el ReferenceError
      if (!config || !config.backgroundColor) return "";
      const avatar = createAvatar(activeStyle.collection, {
         ...config,
         radius: 20,
      });
      return avatar.toString();
   }, [activeStyle, config]);

   const handleStyleChange = (nuevoEstilo: any) => {
      setActiveStyle(nuevoEstilo);
      setActiveTab("style");
      setConfig(prev => ({ backgroundColor: prev.backgroundColor, seed: "user" }));
   };

   const updateConfig = (category: string, value: string) => {
      setConfig((prev: any) => ({
         ...prev,
         [category]: prev[category]?.[0] === value ? [] : [value]
      }));
   };

   const renderGridItem = ({ item }: { item: any }) => {
      // Fondo actual para las previews
      const currentBg = config?.backgroundColor?.[0] || "161616";

      if (activeTab === "style") {
         const isSelected = activeStyle.id === item.id;
         const previewSvg = createAvatar(item.collection, { seed: "VIP", backgroundColor: ["transparent"] }).toString();
         return (
            <TouchableOpacity
               style={[styles.gridItem, { backgroundColor: `#${currentBg}` }, isSelected && styles.selectedBorder]}
               onPress={() => handleStyleChange(item)}
            >
               <SvgXml xml={previewSvg} width="65" height="65" />
            </TouchableOpacity>
         );
      }

      if (activeTab === "backgroundColor") {
         const isSelected = config.backgroundColor[0] === item;
         return (
            <TouchableOpacity
               style={[styles.gridItem, { backgroundColor: `#${item}` }, isSelected && { borderColor: '#FFF', borderWidth: 3 }]}
               onPress={() => updateConfig("backgroundColor", item)}
            />
         );
      }

      const isSelected = config[activeTab] && config[activeTab][0] === item;
      const previewConfig = { ...config, [activeTab]: [item], backgroundColor: ["transparent"] };
      const previewSvg = createAvatar(activeStyle.collection, previewConfig).toString();

      return (
         <TouchableOpacity
            style={[styles.gridItem, { backgroundColor: `#${currentBg}` }, isSelected && styles.selectedBorder]}
            onPress={() => updateConfig(activeTab, item)}
         >
            <SvgXml xml={previewSvg} width="65" height="65" />
         </TouchableOpacity>
      );
   };

   const handleSave = async () => {
      try {
         const { data: { user } } = await supabase.auth.getUser();
         if (!user) return;

         const payload = {
            styleId: activeStyle.id,
            options: config
         };

         // Convertimos el objeto config en parámetros de URL (ej: &backgroundColor=ff0000&top=long)
         const params = Object.entries(config)
            .map(([key, value]) => `${key}=${Array.isArray(value) ? value[0] : value}`)
            .join('&');

         const dynamicAvatarUrl = `https://api.dicebear.com/7.x/${activeStyle.id}/svg?${params}`;

         const { error } = await supabase
            .from('profiles')
            .update({
               avatar_config: payload,
               avatar_url: dynamicAvatarUrl // Ahora la URL guardada tiene el diseño real
            })
            .eq('id', user.id);

         if (error) throw error;

         router.back();
      } catch (error) {
         Alert.alert("Error", "Could not save avatar configuration.");
      }
   };

   useEffect(() => {
      loadCurrentAvatar();
   }, []);

   // Dentro de AvatarSelectScreen...

   async function loadCurrentAvatar() {
      try {
         const { data: { user } } = await supabase.auth.getUser();
         if (!user) return;

         // 1. Traemos tanto la config como el username
         const { data, error } = await supabase
            .from('profiles')
            .select('avatar_config, username')
            .eq('id', user.id)
            .single();

         if (error) throw error;

         if (data?.avatar_config) {
            const savedStyle = ESTILOS_DICEBEAR.find(e => e.id === data.avatar_config.styleId);
            if (savedStyle) setActiveStyle(savedStyle);
            setConfig(data.avatar_config.options);
         } else if (data?.username) {
            // 2. Si no hay config, usamos el username como semilla por defecto
            setConfig(prev => ({
               ...prev,
               seed: data.username // <-- Aquí aplicamos tu lógica de seed por username
            }));
         }
      } catch (error) {
         console.error("Error loading profile data:", error);
      } finally {
         setLoading(false);
      }
   }

   if (loading) return <ActivityIndicator color={getThemeColor('tint')} style={{ flex: 1 }} />;

   return (
      <View style={styles.container}>
         <Stack.Screen
            options={{
               headerTransparent: true,
               headerTitle: "",
               headerRight: () => (
                  <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
                     <ThemedText style={styles.saveBtnText}>Guardar</ThemedText>
                  </TouchableOpacity>
               ),
            }}
         />

         {/* Fondo Dinámico */}
         <View style={[styles.topBackground, { backgroundColor: `#${config?.backgroundColor?.[0] || 'DC143C'}` }]} />

         <SafeAreaView style={{ flex: 1 }} edges={['top']}>
            <View style={styles.previewSection}>
               <View style={styles.avatarWrapper}>
                  {svgString ? <SvgXml xml={svgString} width="220" height="220" /> : null}
               </View>
            </View>

            <View style={[styles.controlsCard, { backgroundColor: getThemeColor("surface") }]}>
               <View style={styles.tabsHeader}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10 }}>
                     {currentTabs.map((tab) => (
                        <TouchableOpacity
                           key={tab}
                           style={[styles.tabButton, activeTab === tab && { borderBottomColor: getThemeColor("tint") }]}
                           onPress={() => setActiveTab(tab)}
                        >
                           <ThemedText style={[styles.tabText, activeTab === tab && { color: getThemeColor("tint") }]}>
                              {tab === "backgroundColor" ? "Color" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                           </ThemedText>
                        </TouchableOpacity>
                     ))}
                  </ScrollView>
               </View>

               <FlatList
                  key={activeTab} // IMPORTANTE: Esto arregla el Grid raro al cambiar de tab
                  data={activeTab === "style" ? ESTILOS_DICEBEAR : activeTab === "backgroundColor" ? COLORES_FONDO : getValidOptions(activeStyle.collection, activeTab)}
                  numColumns={4}
                  renderItem={renderGridItem}
                  contentContainerStyle={styles.gridContainer}
                  columnWrapperStyle={styles.gridRow}
                  keyExtractor={(item, index) => index.toString()}
               />
            </View>
         </SafeAreaView>
      </View>
   );
}

const styles = StyleSheet.create({
   container: { flex: 1, backgroundColor: '#000' },
   topBackground: { position: 'absolute', top: 0, left: 0, right: 0, height: '55%' },
   saveBtn: { paddingHorizontal: 12 },
   saveBtnText: { color: '#FFF', fontWeight: '700' },
   previewSection: { height: '45%', alignItems: 'center', justifyContent: 'center' },
   avatarWrapper: { width: 220, height: 220, borderRadius: 24, elevation: 10 },
   controlsCard: { flex: 1, borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden' },
   tabsHeader: { borderBottomWidth: 1, borderBottomColor: '#161616' },
   tabButton: { paddingVertical: 18, paddingHorizontal: 16, borderBottomWidth: 3, borderBottomColor: 'transparent' },
   tabText: { fontSize: 14, fontWeight: '600', color: '#8A8A8A' },
   gridContainer: { padding: 16, paddingBottom: 120 },
   gridRow: { justifyContent: 'flex-start', gap: 10, marginBottom: 10 },
   gridItem: {
      width: (width - 62) / 4,
      height: 85,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'transparent'
   },
   selectedBorder: { borderColor: '#DC143C' }
});