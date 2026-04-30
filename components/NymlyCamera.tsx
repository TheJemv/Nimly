import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { getThemeColor } from '@/constants/theme';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { GlassView } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import React, { useRef, useState } from 'react';
import { Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function NymlyCamera({
    visible,
    onClose,
    onSend
}: {
    visible: boolean;
    onClose: () => void;
    onSend: (uri: string, type: 'image' | 'image-view-once') => void;
}) {
    const [permission, requestPermission] = useCameraPermissions();
    const [facing, setFacing] = useState<'back' | 'front'>('back');
    const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
    const cameraRef = useRef<CameraView>(null);

    // --- ACCIONES DE CÁMARA ---
    const takePicture = async () => {
        if (cameraRef.current) {
            const photo = await cameraRef.current.takePictureAsync({ exif: true });
            if (photo) {
                // Normaliza la orientación EXIF sin transformaciones adicionales
                const fixed = await ImageManipulator.manipulateAsync(
                    photo.uri,
                    [], // sin rotaciones manuales — solo normaliza el EXIF
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

    // --- PERMISOS ---
    if (!permission) return <View />;
    if (!permission.granted) {
        return (
            <Modal visible={visible} animationType="slide">
                <View style={styles.permissionContainer}>
                    <Text style={{ color: '#fff' }}>Nymly necesita acceso a la cámara.</Text>
                    <TouchableOpacity onPress={requestPermission} style={styles.btn}>
                        <Text>Conceder Permiso</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        );
    }

    return (
        <Modal visible={visible} animationType="slide" transparent={false}>
            <View style={styles.container}>

                {/* === MODO 1: CÁMARA EN VIVO === */}
                {!capturedPhoto ? (
                    <View style={styles.camera}>

                        {/* Botón de Cerrar (Top Left) */}
                        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                            <SymbolView name="xmark" size={24} tintColor="#fff" />
                        </TouchableOpacity>


                        <CameraView style={{ flex: 1, position: "absolute", top: 0, width: "100%", height: "100%" }} facing={facing} ref={cameraRef} />

                        {/* Controles Inferiores */}
                        <View style={styles.bottomControls}>
                            {/* Botón Galería */}
                            <TouchableOpacity onPress={pickFromGallery} style={styles.sideBtn}>
                                <SymbolView name="photo.on.rectangle" size={28} tintColor="#fff" />
                            </TouchableOpacity>

                            {/* Shutter Principal (El círculo grande) */}
                            <TouchableOpacity onPress={takePicture}>
                                <View style={styles.shutterOuter}>
                                    <View style={styles.shutterInner} />
                                </View>
                            </TouchableOpacity>

                            {/* Voltear Cámara */}
                            <TouchableOpacity onPress={toggleCameraFacing} style={styles.sideBtn}>
                                <SymbolView name="arrow.triangle.2.circlepath.camera" size={28} tintColor="#fff" />
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (

                    /* === MODO 2: PREVIEW ESTILO INSTAGRAM === */
                    <View style={styles.previewContainer}>
                        <Image source={{ uri: capturedPhoto }} style={styles.previewImage} />

                        {/* Botón para volver a tomar la foto */}
                        <TouchableOpacity style={styles.closeBtn} onPress={() => setCapturedPhoto(null)}>
                            <SymbolView name="chevron.left" size={24} tintColor="#fff" />
                        </TouchableOpacity>

                        {/* Menú de Decisión (Normal vs View Once) */}
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
                    </View>
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    camera: { flex: 1, justifyContent: 'flex-end', },
    permissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
    btn: { backgroundColor: '#fff', padding: 10, borderRadius: 8, marginTop: 10 },

    // Controles de Cámara
    closeBtn: { position: 'absolute', top: 50, left: 20, zIndex: 10 },
    bottomControls: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingBottom: 50,
        paddingTop: 20,
        backgroundColor: 'rgba(0,0,0,0.4)',
        // position: "absolute",
        // bottom: 0
    },
    shutterOuter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
    shutterInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff' },
    sideBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },

    // Modo Preview
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
    separator: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 15 }
});