import { ThemedText } from "@/components/themed-text";
import { COLORES_FONDO, ESTILOS_DICEBEAR } from "@/constants/dicebear";
import { getThemeColor } from "@/constants/theme";
import { createAvatar } from "@dicebear/core";
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { SvgXml } from "react-native-svg";
// Cambiamos SafeAreaView por el de safe-area-context como pide el warning
import { supabase } from "@/lib/supabase";
import { SafeAreaView } from "react-native-safe-area-context";

interface AvatarConfig {
   [key: string]: any; // Esto permite que el objeto tenga propiedades dinámicas
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
   // "style" y "backgroundColor" ya se agregan a mano abajo — algunas colecciones
   // (ej. avataaars) tienen SU PROPIA propiedad de schema llamada literalmente
   // "style" (circle/default), lo que duplicaba el tab y hacía tronar React con
   // "Encountered two children with the same key".
   const ignore = [
      'seed', 'flip', 'rotate', 'scale', 'radius', 'backgroundColor', 'style',
      'backgroundType', 'backgroundRotation', 'translateX', 'translateY', 'clip'
   ];

   return ["style", "backgroundColor", ...Object.keys(schema).filter(key => {
      // 1. Ignorar campos técnicos
      if (ignore.includes(key)) return false;
      // 2. Ignorar campos que terminen en "Probability" o "Rotation"
      if (key.toLowerCase().includes('probability') || key.toLowerCase().includes('rotation')) return false;

      // 3. Solo incluir propiedades que tengan un listado de opciones (enum)
      const prop = schema[key];
      return (prop.items && prop.items.enum) || prop.enum;
   })];
};

export default function AvatarSelectScreen() {
   const router = useRouter();

   // Estados
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

      // Agregamos 'as any' a la colección y al config
      const avatar = createAvatar(activeStyle.collection as any, config as any);

      return avatar.toString();
   }, [activeStyle, config]);

   const handleStyleChange = (nuevoEstilo: any) => {
      setActiveStyle(nuevoEstilo);
      setActiveTab("style");
      // Reseteamos el config (las opciones de un estilo no sirven en otro),
      // pero mantenemos fondo y seed — si no, cada cambio de estilo perdía
      // la seed del username y todos terminaban con el mismo avatar "user".
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

      // Si es estilo o color, usa la lógica actual
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

      // --- AQUÍ ESTÁ EL CAMBIO PARA OTRAS PROPIEDADES ---
      const currentOptions = config[activeTab] || [];
      const isSelected = currentOptions[0] === item;

      // Crear configuración para previsualizar sin romper nada
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

         // Convertimos el objeto config en parámetros de URL (ej: &backgroundColor=ff0000&top=long)
         const params = Object.entries(config)
            .map(([key, value]) => `${key}=${Array.isArray(value) ? value[0] : value}`)
            .join('&');

         // La API REST de DiceBear usa slugs kebab-case (ej. "adventurer-neutral"),
         // pero nuestros ids son camelCase ("adventurerNeutral") — sin este mapeo
         // la URL quedaba rota (404) para más de la mitad de los estilos.
         const apiSlug = activeStyle.id.replace(/([A-Z])/g, "-$1").toLowerCase();
         const dynamicAvatarUrl = `https://api.dicebear.com/7.x/${apiSlug}/svg?${params}`;

         const { error } = await supabase
            .from('profiles')
            .update({
               avatar_config: payload,
               avatar_url: dynamicAvatarUrl // Ahora la URL guardada tiene el diseño real
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
      // Si el tab actual no existe en el nuevo estilo, vuelve a "style"
      if (!currentTabs.includes(activeTab)) {
         setActiveTab("style");
      }
   }, [currentTabs]);

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
                     <ThemedText style={styles.saveBtnText}>Save</ThemedText>
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

               {/*
                  Antes esto era un FlatList con numColumns=4. Con listas tan chicas
                  (máx. ~22 items) la virtualización de FlatList no aporta nada y sí
                  suma riesgo: sin `extraData`, las celdas ya montadas no se enteran
                  cuando cambia `config`/`activeStyle` por closure (no por `data`), así
                  que el borde de selección y el preview se quedaban pegados a una
                  opción vieja. Un View con flexWrap siempre usa el closure actual.
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