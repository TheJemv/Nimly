import { getThemeColor } from '@/constants/theme';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { styles } from './LiquidGlassSelector.styles';

const MUTED = getThemeColor('textSecondary');

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
                    <SymbolView name="text.bubble.fill" size={18} tintColor={activeTab === 'text' ? "#FFF" : MUTED} />
                    <Text style={[styles.tabText, { color: activeTab === 'text' ? "#FFF" : MUTED }]}>Texto</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.tab}
                    onPress={() => onTabChange('media')}
                    activeOpacity={1}
                >
                    <SymbolView name="play.square.stack.fill" size={18} tintColor={activeTab === 'media' ? "#FFF" : MUTED} />
                    <Text style={[styles.tabText, { color: activeTab === 'media' ? "#FFF" : MUTED }]}>Media</Text>
                </TouchableOpacity>
            </BlurView>
        </View>
    );
}