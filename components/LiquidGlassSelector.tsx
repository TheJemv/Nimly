import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

interface Props {
    activeTab: 'text' | 'media';
    onTabChange: (tab: 'text' | 'media') => void;
    tintColor: string;
}

export default function LiquidGlassSelector({ activeTab, onTabChange, tintColor }: Props) {
    const pillStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: withSpring(activeTab === 'text' ? 4 : 96, { damping: 15, stiffness: 120 }) }],
    }));

    return (
        <View style={styles.outerContainer}>
            <BlurView intensity={20} tint="dark" style={styles.glassContainer}>
                {/* Indicador Líquido (The Liquid Pill) */}
                <Animated.View style={[styles.pill, pillStyle, { backgroundColor: tintColor }]} />

                <TouchableOpacity
                    style={styles.tab}
                    onPress={() => onTabChange('text')}
                    activeOpacity={1}
                >
                    <SymbolView name="text.bubble.fill" size={18} tintColor={activeTab === 'text' ? "#FFF" : "#636366"} />
                    <Text style={[styles.tabText, { color: activeTab === 'text' ? "#FFF" : "#636366" }]}>Texto</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.tab}
                    onPress={() => onTabChange('media')}
                    activeOpacity={1}
                >
                    <SymbolView name="play.square.stack.fill" size={18} tintColor={activeTab === 'media' ? "#FFF" : "#636366"} />
                    <Text style={[styles.tabText, { color: activeTab === 'media' ? "#FFF" : "#636366" }]}>Media</Text>
                </TouchableOpacity>
            </BlurView>
        </View>
    );
}

const styles = StyleSheet.create({
    outerContainer: { alignItems: 'center', marginVertical: 20 },
    glassContainer: {
        flexDirection: 'row',
        width: 190,
        height: 44,
        borderRadius: 22,
        padding: 4,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
    },
    pill: {
        position: 'absolute',
        top: 4,
        width: 90,
        height: 36,
        borderRadius: 18,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    tabText: { fontSize: 13, fontWeight: '600' }
});