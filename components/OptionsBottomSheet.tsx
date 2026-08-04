import { ThemedText } from '@/components/themed-text';
import { getThemeColor } from '@/constants/theme';
import { BottomSheetBackdrop, BottomSheetModal } from '@gorhom/bottom-sheet';
import { SFSymbol, SymbolView } from 'expo-symbols';
import React, { forwardRef, useCallback } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface Option {
    label: string;
    icon: SFSymbol;
    onPress: () => void;
    isDestructive?: boolean;
}

interface Props {
    options: Option[];
}

export const OptionsBottomSheet = forwardRef<BottomSheetModal, Props>(({ options }, ref) => {
    const surface = getThemeColor('surface');

    // Renderizado del fondo oscurecido
    const renderBackdrop = useCallback(
        (props: any) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />,
        []
    );

    return (
        <BottomSheetModal
            ref={ref}
            // Calculamos altura dinámica pero con un mínimo seguro
            snapPoints={['50%']}
            backgroundStyle={{ backgroundColor: surface }}
            handleIndicatorStyle={{ backgroundColor: '#444' }}
            backdropComponent={renderBackdrop}
            enablePanDownToClose={true}
        >
            <View style={styles.menuContainer}>
                {options.map((opt, index) => (
                    <TouchableOpacity
                        key={index}
                        style={styles.menuItem}
                        onPress={() => {
                            opt.onPress();
                            // @ts-ignore
                            ref.current?.dismiss();
                        }}
                    >
                        <SymbolView
                            name={opt.icon}
                            size={22}
                            tintColor={opt.isDestructive ? '#ff453a' : '#fff'}
                        />
                        <ThemedText style={[styles.menuText, opt.isDestructive && { color: '#ff453a' }]}>
                            {opt.label}
                        </ThemedText>
                    </TouchableOpacity>
                ))}
            </View>
        </BottomSheetModal>
    );
});

const styles = StyleSheet.create({
    menuContainer: { padding: 20 },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 15,
        paddingVertical: 16 // Un poco más de espacio para tocar
    },
    menuText: { fontSize: 17, fontWeight: '500' }
});