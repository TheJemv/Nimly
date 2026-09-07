// components/CameraModeSelector.tsx
import { getThemeColor } from '@/constants/theme';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { PILL_TRAVEL, styles } from './CameraModeSelector.styles';

const MUTED = getThemeColor('textSecondary');

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
    tintColor = getThemeColor('tint'),
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
                    <SymbolView name="camera.fill" size={16} tintColor={activeMode === 'photo' ? '#FFF' : MUTED} />
                    <Text style={[styles.tabText, { color: activeMode === 'photo' ? '#FFF' : MUTED }]}>Photo</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.tab} onPress={() => onModeChange('video')} activeOpacity={0.8}>
                    <SymbolView name="video.fill" size={16} tintColor={activeMode === 'video' ? '#FFF' : MUTED} />
                    <Text style={[styles.tabText, { color: activeMode === 'video' ? '#FFF' : MUTED }]}>Video</Text>
                </TouchableOpacity>
            </BlurView>
        </View>
    );
}
