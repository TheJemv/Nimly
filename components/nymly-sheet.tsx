import { getThemeColor } from '@/constants/theme';
import { BottomSheetBackdrop, BottomSheetFooterProps, BottomSheetModal } from '@gorhom/bottom-sheet';
import React, { forwardRef, useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface NymlySheetProps {
    children: React.ReactNode;
    snapPoints: string[];
    onChange?: (index: number) => void;
    footerComponent?: React.FC<BottomSheetFooterProps>;
}

const NymlySheet = forwardRef<BottomSheetModal, NymlySheetProps>(
    ({ children, snapPoints, onChange, footerComponent }, ref) => {
        const insets = useSafeAreaInsets();

        const renderBackdrop = useCallback(
            (props: any) => (
                <BottomSheetBackdrop
                    {...props}
                    disappearsOnIndex={-1}
                    appearsOnIndex={0}
                    pressBehavior="close"
                    opacity={0.6}
                />
            ),
            []
        );

        return (
            <BottomSheetModal
                ref={ref}
                index={0}
                snapPoints={snapPoints}
                onChange={onChange}
                backdropComponent={renderBackdrop}
                footerComponent={footerComponent}

                // We block automatic sizing to avoid the "mini" state
                enableDynamicSizing={false}

                // Instagram-style effect
                keyboardBehavior="extend"
                android_keyboardInputMode="adjustResize"
                keyboardBlurBehavior="restore"
                enablePanDownToClose={true}

                backgroundStyle={styles.background}
                handleIndicatorStyle={styles.indicator}
                topInset={insets.top}
            >
                {children}
            </BottomSheetModal>
        );
    }
);

const styles = StyleSheet.create({
    background: {
        backgroundColor: '#050505',
    },
    indicator: {
        backgroundColor: getThemeColor('border'),
        width: 40,
    }
});

export default NymlySheet;