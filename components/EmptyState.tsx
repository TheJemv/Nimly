import { getThemeColor } from '@/constants/theme';
import { SFSymbol, SymbolView } from 'expo-symbols';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

interface EmptyStateProps {
    icon: SFSymbol;
    title: string;
    message?: string;
    style?: StyleProp<ViewStyle>;
}

/** Icon + title + short hint for a list with nothing in it yet. */
export default function EmptyState({ icon, title, message, style }: EmptyStateProps) {
    return (
        <View style={[styles.container, style]}>
            <SymbolView name={icon} size={44} tintColor={getThemeColor('textSecondary')} />
            <Text style={styles.title}>{title}</Text>
            {message ? <Text style={styles.message}>{message}</Text> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { alignItems: 'center', paddingHorizontal: 40, gap: 10 },
    title: { fontSize: 17, fontWeight: '600', color: '#fff', marginTop: 6, textAlign: 'center' },
    message: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 },
});
