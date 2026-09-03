// components/CameraModeSelector.tsx
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { PILL_TRAVEL, styles } from './CameraModeSelector.styles';

export type CameraCaptureMode = 'photo' | 'video';

interface CameraModeSelectorProps {
    activeMode: CameraCaptureMode;
    onModeChange: (mode: CameraCaptureMode) => void;
    tintColor?: string;
    disabled?: boolean;
}

export default function CameraModeSelector({
    activeMode,
    onModeChange,
    tintColor = '#DC143C',
    disabled = false,
}: CameraModeSelectorProps) {
    const pillStyle = useAnimatedStyle(() => ({
        transform: [
            {
                translateX: withSpring(activeMode === 'photo' ? 0 : PILL_TRAVEL, {
                    damping: 16,
                    stiffness: 140,
                }),
            },
        ],
    }));

    return (
        <View style={[styles.outerContainer, disabled && { opacity: 0 }]} pointerEvents={disabled ? 'none' : 'auto'}>
            <BlurView intensity={25} tint="dark" style={styles.glassContainer}>
                <Animated.View style={[styles.pill, pillStyle, { backgroundColor: tintColor }]} />

                <TouchableOpacity style={styles.tab} onPress={() => onModeChange('photo')} activeOpacity={0.8}>
                    <SymbolView name="camera.fill" size={16} tintColor={activeMode === 'photo' ? '#FFF' : '#8E8E93'} />
                    <Text style={[styles.tabText, { color: activeMode === 'photo' ? '#FFF' : '#8E8E93' }]}>Photo</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.tab} onPress={() => onModeChange('video')} activeOpacity={0.8}>
                    <SymbolView name="video.fill" size={16} tintColor={activeMode === 'video' ? '#FFF' : '#8E8E93'} />
                    <Text style={[styles.tabText, { color: activeMode === 'video' ? '#FFF' : '#8E8E93' }]}>Video</Text>
                </TouchableOpacity>
            </BlurView>
        </View>
    );
}
