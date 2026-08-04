// components/CameraModeSelector.tsx
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { styles } from './CameraModeSelector.styles';

export type CameraCaptureMode = 'photo' | 'video';

interface CameraModeSelectorProps {
    activeMode: CameraCaptureMode;
    onModeChange: (mode: CameraCaptureMode) => void;
    tintColor?: string;
}

export default function CameraModeSelector({
    activeMode,
    onModeChange,
    tintColor = '#DC143C', // Carmesí por defecto
}: CameraModeSelectorProps) {
    const pillStyle = useAnimatedStyle(() => ({
        transform: [
            {
                translateX: withSpring(activeMode === 'photo' ? 4 : 96, {
                    damping: 16,
                    stiffness: 140,
                }),
            },
        ],
    }));

    return (
        <View style={styles.outerContainer}>
            <BlurView intensity={25} tint="dark" style={styles.glassContainer}>
                {/* Indicador Líquido Animado */}
                <Animated.View style={[styles.pill, pillStyle, { backgroundColor: tintColor }]} />

                {/* Tab Foto */}
                <TouchableOpacity
                    style={styles.tab}
                    onPress={() => onModeChange('photo')}
                    activeOpacity={0.8}
                >
                    <SymbolView
                        name="camera.fill"
                        size={16}
                        tintColor={activeMode === 'photo' ? '#FFF' : '#8E8E93'}
                    />
                    <Text style={[styles.tabText, { color: activeMode === 'photo' ? '#FFF' : '#8E8E93' }]}>
                        Foto
                    </Text>
                </TouchableOpacity>

                {/* Tab Video */}
                <TouchableOpacity
                    style={styles.tab}
                    onPress={() => onModeChange('video')}
                    activeOpacity={0.8}
                >
                    <SymbolView
                        name="video.fill"
                        size={16}
                        tintColor={activeMode === 'video' ? '#FFF' : '#8E8E93'}
                    />
                    <Text style={[styles.tabText, { color: activeMode === 'video' ? '#FFF' : '#8E8E93' }]}>
                        Video
                    </Text>
                </TouchableOpacity>
            </BlurView>
        </View>
    );
}