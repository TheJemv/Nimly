import { ThemedText } from "@/components/themed-text";
import { COLORES_FONDO, ESTILOS_DICEBEAR } from "@/constants/dicebear";
import { getThemeColor } from "@/constants/theme";
import { createAvatar } from "@dicebear/core";
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { SvgXml } from "react-native-svg";
// Switched to the SafeAreaView from safe-area-context as the warning asks
import { supabase } from "@/lib/supabase";
import { SafeAreaView } from "react-native-safe-area-context";

interface AvatarConfig {
   [key: string]: any; // This allows the object to have dynamic properties
   backgroundColor: string[];
   seed: string;
}

const { width } = Dimensions.get("window");
const getValidOptions = (collection: any, category: string) => {
   try {
      const prop = collection.schema.properties[category];
      if (!prop) return [];
      if (prop.items && prop.items.enum) return prop.items.enum;
      if (prop.enum) return prop.enum;
      return [];
   } catch {
      return [];
   }
};

const getDynamicTabs = (collection: any) => {
   const schema = collection.schema.properties;
   // "style" and "backgroundColor" are already added by hand below — some
   // collections (e.g. avataaars) have THEIR OWN schema property literally
   // called "style" (circle/default), which duplicated the tab and made React
   // blow up with "Encountered two children with the same key".
   const ignore = [
      'seed', 'flip', 'rotate', 'scale', 'radius', 'backgroundColor', 'style',
      'backgroundType', 'backgroundRotation', 'translateX', 'translateY', 'clip'
   ];

   return ["style", "backgroundColor", ...Object.keys(schema).filter(key => {
      // 1. Ignore technical fields
      if (ignore.includes(key)) return false;
      // 2. Ignore fields ending in "Probability" or "Rotation"
      if (key.toLowerCase().includes('probability') || key.toLowerCase().includes('rotation')) return false;

      // 3. Only include properties that have a list of options (enum)
      const prop = schema[key];
      return (prop.items && prop.items.enum) || prop.enum;
   })];
};

export default function AvatarSelectScreen() {
   const router = useRouter();

   // State
   const [loading, setLoading] = useState(true);
   const [activeStyle, setActiveStyle] = useState(ESTILOS_DICEBEAR[0]);
   const [activeTab, setActiveTab] = useState("style");
   const [config, setConfig] = useState<AvatarConfig>({
      backgroundColor: ["DC143C"],
      seed: "user",
   });

   const currentTabs = useMemo(() => getDynamicTabs(activeStyle.collection), [activeStyle]);
   const svgString = useMemo(() => {
      if (!config || !config.backgroundColor) return "";

      // Adding 'as any' to the collection and the config
      const avatar = createAvatar(activeStyle.collection as any, config as any);

      return avatar.toString();
   }, [activeStyle, config]);

   const handleStyleChange = (nuevoEstilo: any) => {
      setActiveStyle(nuevoEstilo);
      setActiveTab("style");
      // Reset the config (one style's options don't work on another),
      // but keep background and seed — otherwise every style change lost
      // the username seed and everyone ended up with the same "user" avatar.
      setConfig({
         backgroundColor: config.backgroundColor || ["DC143C"],
         seed: config.seed || "user"
      });
   };

   const updateConfig = (category: string, value: string) => {
      setConfig((prev: any) => ({
         ...prev,
         [category]: prev[category]?.[0] === value ? [] : [value]
      }));
   };

   const renderGridItem = ({ item }: { item: any }) => {
      const currentBg = config?.backgroundColor?.[0] || "161616";

      // For style or color, use the current logic
      if (activeTab === "style") {
         const isSelected = activeStyle.id === item.id;
         const previewSvg = createAvatar(item.collection as any, { seed: "VIP", backgroundColor: ["transparent"] }).toString();
         return (
            <TouchableOpacity style={[styles.gridItem, { backgroundColor: `#${currentBg}` }, isSelected && styles.selectedBorder]} onPress={() => handleStyleChange(item)}>
               <SvgXml xml={previewSvg} width="65" height="65" />
            </TouchableOpacity>
         );
      }

      if (activeTab === "backgroundColor") {
         const isSelected = config.backgroundColor[0] === item;
         return (
            <TouchableOpacity style={[styles.gridItem, { backgroundColor: `#${item}` }, isSelected && { borderColor: '#FFF', borderWidth: 3 }]} onPress={() => updateConfig("backgroundColor", item)} />
         );
      }

      // --- THIS IS THE HANDLING FOR OTHER PROPERTIES ---
      const currentOptions = config[activeTab] || [];
      const isSelected = currentOptions[0] === item;

      // Create a config to preview without breaking anything
      const previewConfig = { ...config, [activeTab]: [item] };
      const previewSvg = createAvatar(activeStyle.collection as any, previewConfig as any).toString();

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

         // Convert the config object into URL params (e.g. &backgroundColor=ff0000&top=long)
         const params = Object.entries(config)
            .map(([key, value]) => `${key}=${Array.isArray(value) ? value[0] : value}`)
            .join('&');

         // DiceBear's REST API uses kebab-case slugs (e.g. "adventurer-neutral"),
         // but our ids are camelCase ("adventurerNeutral") — without this mapping
         // the URL was broken (404) for more than half of the styles.
         const apiSlug = activeStyle.id.replace(/([A-Z])/g, "-$1").toLowerCase();
         const dynamicAvatarUrl = `https://api.dicebear.com/7.x/${apiSlug}/svg?${params}`;

         const { error } = await supabase
            .from('profiles')
            .update({
               avatar_config: payload,
               avatar_url: dynamicAvatarUrl // Now the saved URL has the actual design
            })
            .eq('id', user.id);

         if (error) throw error;

         router.back();
      } catch {
         Alert.alert("Error", "Could not save avatar configuration.");
      }
   };

   useEffect(() => {
      loadCurrentAvatar();
   }, []);

   useEffect(() => {
      // If the current tab doesn't exist in the new style, go back to "style"
      if (!currentTabs.includes(activeTab)) {
         setActiveTab("style");
      }
   }, [currentTabs]);

   // Inside AvatarSelectScreen...

   async function loadCurrentAvatar() {
      try {
         const { data: { user } } = await supabase.auth.getUser();
         if (!user) return;

         // 1. Fetch both the config and the username
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
            // 2. If there's no config, use the username as the default seed
            setConfig(prev => ({
               ...prev,
               seed: data.username // <-- Here we apply the username-based seed logic
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
                     <ThemedText style={styles.saveBtnText}>Save</ThemedText>
                  </TouchableOpacity>
               ),
            }}
         />

         {/* Dynamic Background */}
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

               {/*
                  This used to be a FlatList with numColumns=4. With lists this small
                  (~22 items max), FlatList's virtualization doesn't help and adds
                  risk: without `extraData`, already-mounted cells don't find out
                  when `config`/`activeStyle` change via closure (not via `data`), so
                  the selection border and the preview stayed stuck on an old
                  option. A View with flexWrap always uses the current closure.
               */}
               <ScrollView contentContainerStyle={styles.gridContainer} keyboardShouldPersistTaps="handled">
                  <View style={styles.gridWrap}>
                     {(activeTab === "style" ? ESTILOS_DICEBEAR : activeTab === "backgroundColor" ? COLORES_FONDO : getValidOptions(activeStyle.collection, activeTab)).map((item: any, index: number) => (
                        <React.Fragment key={`${activeTab}:${index}`}>
                           {renderGridItem({ item })}
                        </React.Fragment>
                     ))}
                  </View>
               </ScrollView>
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
   gridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
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