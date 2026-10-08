import { SFSymbol, SymbolView } from 'expo-symbols';
import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getThemeColor } from '@/constants/theme';
import { styles } from '../FaceScanScreen.styles';

const POINTS: { icon: SFSymbol; text: string }[] = [
    { icon: 'faceid', text: 'Your face template is biometric data. It is used only for face recognition on Nimly.' },
    { icon: 'video.slash', text: 'The video is deleted as soon as your template is created. Only the template is kept.' },
    { icon: 'trash', text: 'You can delete your face data anytime in Settings.' },
];

type FaceConsentProps = {
    onAccept: () => void;
    onDecline: () => void;
};

// Biometric consent: the scan can't start, and nothing is sent, without it.
export default function FaceConsent({ onAccept, onDecline }: FaceConsentProps) {
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, styles.consent, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity style={[styles.closeBtn, { top: insets.top + 12 }]} onPress={onDecline} hitSlop={12}>
                <SymbolView name="xmark" size={22} tintColor="#fff" />
            </TouchableOpacity>

            <View style={styles.consentBody}>
                <View style={styles.consentIcon}>
                    <SymbolView name="faceid" size={40} tintColor={getThemeColor('tint')} />
                </View>
                <Text style={styles.title}>Set up Nimly Face</Text>
                <Text style={styles.subtitle}>
                    Nimly will record a short video of your face while you move your head, and use it to create a face template that recognizes you.
                </Text>

                <View style={styles.consentPoints}>
                    {POINTS.map(({ icon, text }) => (
                        <View key={icon} style={styles.consentPoint}>
                            <SymbolView name={icon} size={20} tintColor="#fff" />
                            <Text style={styles.consentPointText}>{text}</Text>
                        </View>
                    ))}
                </View>
            </View>

            <View style={styles.consentActions}>
                <Text style={styles.consentFootnote}>
                    By continuing, you consent to Nimly processing your biometric data for face recognition.
                </Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={onAccept}>
                    <Text style={styles.primaryText}>Agree and Continue</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={onDecline}>
                    <Text style={styles.secondaryText}>Not Now</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
