import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import PermissionRequest from '@/components/PermissionRequest';
import { getThemeColor } from '@/constants/theme';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { GlassView } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import React, { useRef, useState } from 'react';
import { Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function NymlyCamera({
    visible,
    onClose,
    onSend,
    simpleMode = false, // 👈 NUEVO: oculta el panel "View Once" para usos como NewPost
}: {
    visible: boolean;
    onClose: () => void;
    onSend: (uri: string, type: 'image' | 'image-view-once') => void;
    simpleMode?: boolean;
}) {
    const [permission, requestPermission] = useCameraPermissions();
    const [facing, setFacing] = useState<'back' | 'front'>('back');
    const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
    const cameraRef = useRef<CameraView>(null);

    const takePicture = async () => {
        if (cameraRef.current) {
            const photo = await cameraRef.current.takePictureAsync({ exif: true });
            if (photo) {
                const fixed = await ImageManipulator.manipulateAsync(
                    photo.uri,
                    [],
                    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
                );
                setCapturedPhoto(fixed.uri);
            }
        }
    };

    const pickFromGallery = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.7,
        });
        if (!result.canceled && result.assets[0].uri) {
            setCapturedPhoto(result.assets[0].uri);
        }
    };

    const toggleCameraFacing = () => {
        setFacing(current => (current === 'back' ? 'front' : 'back'));
    };

    if (!permission) return <View />;
    if (!permission.granted) {
        return (
            <PermissionRequest
                visible={visible}
                icon="camera.fill"
                title="Camera Access"
                subtitle="Nimly needs access to your camera to capture photos for your encrypted chats and posts."
                confirmLabel="Enable Camera"
                onRequest={requestPermission}
                onClose={onClose}
            />
        );
    }

    return (
        <Modal visible={visible} animationType="slide" transparent={false}>
            <View style={styles.container}>
                {!capturedPhoto ? (
                    <View style={styles.camera}>
                        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                            <SymbolView name="xmark" size={24} tintColor="#fff" />
                        </TouchableOpacity>

                        <CameraView style={{ flex: 1, position: "absolute", top: 0, width: "100%", height: "100%" }} facing={facing} ref={cameraRef} />

                        <View style={styles.bottomControls}>
                            <TouchableOpacity onPress={pickFromGallery} style={styles.sideBtn}>
                                <SymbolView name="photo.on.rectangle" size={28} tintColor="#fff" />
                            </TouchableOpacity>

                            <TouchableOpacity onPress={takePicture}>
                                <View style={styles.shutterOuter}>
                                    <View style={styles.shutterInner} />
                                </View>
                            </TouchableOpacity>

                            <TouchableOpacity onPress={toggleCameraFacing} style={styles.sideBtn}>
                                <SymbolView name="arrow.triangle.2.circlepath.camera" size={28} tintColor="#fff" />
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <View style={styles.previewContainer}>
                        <Image source={{ uri: capturedPhoto }} style={styles.previewImage} />

                        <TouchableOpacity style={styles.closeBtn} onPress={() => setCapturedPhoto(null)}>
                            <SymbolView name="chevron.left" size={24} tintColor="#fff" />
                        </TouchableOpacity>

                        {simpleMode ? (
                            // 👇 Modo simple: un solo botón, sin decisión de View Once
                            <GlassView style={styles.simplePanel}>
                                <TouchableOpacity
                                    style={styles.simpleBtn}
                                    onPress={() => {
                                        onSend(capturedPhoto, 'image');
                                        setCapturedPhoto(null);
                                        onClose();
                                    }}
                                >
                                    <SymbolView name="checkmark.circle.fill" size={20} tintColor={getThemeColor('tint')} />
                                    <Text style={[styles.decisionText, { color: getThemeColor('tint') }]}>Use Photo</Text>
                                </TouchableOpacity>
                            </GlassView>
                        ) : (
                            <GlassView style={styles.decisionPanel}>
                                <TouchableOpacity
                                    style={styles.decisionBtn}
                                    onPress={() => {
                                        onSend(capturedPhoto, 'image');
                                        setCapturedPhoto(null);
                                        onClose();
                                    }}
                                >
                                    <SymbolView name="infinity" size={24} tintColor="#fff" />
                                    <Text style={styles.decisionText}>Keep in Chat</Text>
                                </TouchableOpacity>

                                <View style={styles.separator} />

                                <TouchableOpacity
                                    style={styles.decisionBtn}
                                    onPress={() => {
                                        onSend(capturedPhoto, 'image-view-once');
                                        setCapturedPhoto(null);
                                        onClose();
                                    }}
                                >
                                    <SymbolView name="eye.fill" size={24} tintColor={getThemeColor('tint')} />
                                    <Text style={[styles.decisionText, { color: getThemeColor('tint') }]}>View Once</Text>
                                </TouchableOpacity>
                            </GlassView>
                        )}
                    </View>
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    camera: { flex: 1, justifyContent: 'flex-end' },
    closeBtn: { position: 'absolute', top: 50, left: 20, zIndex: 10 },
    bottomControls: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingBottom: 50,
        paddingTop: 20,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    shutterOuter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
    shutterInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff' },
    sideBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    previewContainer: { flex: 1, backgroundColor: '#000' },
    previewImage: { flex: 1, resizeMode: 'cover' },
    decisionPanel: {
        position: 'absolute',
        bottom: 40,
        left: 20,
        right: 20,
        flexDirection: 'row',
        borderRadius: 25,
        overflow: 'hidden',
    },
    decisionBtn: { flex: 1, paddingVertical: 18, alignItems: 'center', gap: 8 },
    decisionText: { color: '#fff', fontSize: 13, fontWeight: '600' },
    separator: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 15 },
    // 👇 nuevo: panel simple para modo post
    simplePanel: {
        position: 'absolute',
        bottom: 40,
        left: 20,
        right: 20,
        borderRadius: 25,
        overflow: 'hidden',
    },
    simpleBtn: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 18,
        gap: 10,
    },
});