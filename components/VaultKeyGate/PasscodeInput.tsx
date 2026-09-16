import { getThemeColor } from '@/constants/theme';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

const LENGTH = 6;
const TINT = getThemeColor('tint');
const SURFACE = getThemeColor('surface');
const BORDER = getThemeColor('border');
const ICON = getThemeColor('icon');

interface Props {
    value: string;
    onChange: (v: string) => void;
    onFilled?: (v: string) => void;
    autoFocus?: boolean;
    editable?: boolean;
}

/** 6-digit PIN field: 6 boxes + a hidden TextInput that feeds them. */
export default function PasscodeInput({ value, onChange, onFilled, autoFocus, editable = true }: Props) {
    const ref = useRef<TextInput>(null);

    useEffect(() => {
        if (autoFocus) {
            const t = setTimeout(() => ref.current?.focus(), 250);
            return () => clearTimeout(t);
        }
    }, [autoFocus]);

    const handleChange = (raw: string) => {
        const digits = raw.replace(/\D/g, '').slice(0, LENGTH);
        onChange(digits);
        if (digits.length === LENGTH) onFilled?.(digits);
    };

    return (
        <Pressable style={styles.row} onPress={() => ref.current?.focus()}>
            {Array.from({ length: LENGTH }).map((_, i) => {
                const filled = i < value.length;
                const active = i === value.length && editable;
                return (
                    <View key={i} style={[styles.box, active && styles.boxActive, filled && styles.boxFilled]}>
                        <View style={[styles.dot, filled && styles.dotOn]} />
                    </View>
                );
            })}

            <TextInput
                ref={ref}
                value={value}
                onChangeText={handleChange}
                keyboardType="number-pad"
                maxLength={LENGTH}
                editable={editable}
                caretHidden
                style={styles.hiddenInput}
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
            />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'center', gap: 10, width: '100%' },
    box: {
        width: 44,
        height: 52,
        borderRadius: 12,
        backgroundColor: SURFACE,
        borderWidth: 1.5,
        borderColor: BORDER,
        alignItems: 'center',
        justifyContent: 'center',
    },
    boxActive: { borderColor: TINT },
    boxFilled: { borderColor: ICON },
    dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: 'transparent' },
    dotOn: { backgroundColor: '#fff' },
    // Covers the whole row but is invisible: any touch focuses it and opens the keyboard.
    hiddenInput: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        color: 'transparent',
    },
});
