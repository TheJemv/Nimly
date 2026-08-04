import { getThemeColor } from '@/constants/theme';
import { SFSymbol, SymbolView } from 'expo-symbols';
import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { styles } from './PermissionRequest.styles';

type PermissionRequestProps = {
    visible: boolean;
    icon: SFSymbol; // nombre del SF Symbol, ej: 'camera.fill', 'mic.fill', 'photo.on.rectangle'
    title: string;
    subtitle: string;
    confirmLabel?: string;
    skipLabel?: string;
    onRequest: () => void;
    onClose: () => void;
};

export default function PermissionRequest({
    visible,
    icon,
    title,
    subtitle,
    confirmLabel = "Enable",
    skipLabel = "Not Now",
    onRequest,
    onClose,
}: PermissionRequestProps) {
    return (
        <Modal visible={visible} animationType="slide" transparent={false}>
            <View style={styles.container}>
                <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                    <SymbolView name="xmark" size={24} tintColor="#fff" />
                </TouchableOpacity>

                <View style={styles.content}>
                    <View style={styles.iconCircle}>
                        <SymbolView name={icon} size={36} tintColor={getThemeColor('tint')} />
                    </View>

                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.subtitle}>{subtitle}</Text>

                    <TouchableOpacity onPress={onRequest} style={styles.confirmBtn}>
                        <Text style={styles.confirmText}>{confirmLabel}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={onClose} style={styles.skipBtn}>
                        <Text style={styles.skipText}>{skipLabel}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}