import { getThemeColor } from '@/constants/theme';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type PermissionRequestProps = {
    visible: boolean;
    icon: string; // nombre del SF Symbol, ej: 'camera.fill', 'mic.fill', 'photo.on.rectangle'
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

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    closeBtn: { position: 'absolute', top: 50, left: 20, zIndex: 10 },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
        gap: 12,
    },
    iconCircle: {
        width: 84,
        height: 84,
        borderRadius: 42,
        backgroundColor: 'rgba(255,255,255,0.06)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    title: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '700',
    },
    subtitle: {
        color: '#888',
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 16,
        maxWidth: 280,
    },
    confirmBtn: {
        backgroundColor: getThemeColor('tint'),
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 25,
        width: '100%',
        alignItems: 'center',
    },
    confirmText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '700',
    },
    skipBtn: {
        paddingVertical: 12,
    },
    skipText: {
        color: '#666',
        fontSize: 14,
        fontWeight: '500',
    },
});