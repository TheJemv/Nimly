import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

const LENGTH = 6;

interface Props {
    value: string;
    onChange: (v: string) => void;
    onFilled?: (v: string) => void;
    autoFocus?: boolean;
    editable?: boolean;
}

/** Campo de PIN de 6 dígitos: 6 casillas + un TextInput oculto que las alimenta. */
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
        backgroundColor: '#1C1C1E',
        borderWidth: 1.5,
        borderColor: '#2C2C2E',
        alignItems: 'center',
        justifyContent: 'center',
    },
    boxActive: { borderColor: '#DC143C' },
    boxFilled: { borderColor: '#3A3A3C' },
    dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: 'transparent' },
    dotOn: { backgroundColor: '#fff' },
    // Cubre toda la fila pero es invisible: cualquier toque enfoca y abre el teclado.
    hiddenInput: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        color: 'transparent',
    },
});
