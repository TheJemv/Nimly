import { GlassView } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

interface GlassButtonProps {
    icon: string | any;
    size?: number;
    onPress?: () => void;
}

export default function GlassButton({ icon, size = 44, onPress }: GlassButtonProps) {
    return (
        <GlassView
            style={{ width: size, height: size, borderRadius: size / 2 }}
            glassEffectStyle='regular'
            onTouchEnd={onPress}
        >
            <View style={styles.inner}>
                <SymbolView name={icon} size={size * 0.45} tintColor='#fff' />
            </View>
        </GlassView>
    );
}

const styles = StyleSheet.create({
    inner: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});