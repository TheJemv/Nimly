import { getThemeColor } from '@/constants/theme';
import { useRouter } from 'expo-router';
import React from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TermsModal() {
    const router = useRouter();

    const bg = getThemeColor('background');
    const textMain = getThemeColor('text');
    const textSec = getThemeColor('textSecondary');
    const accent = getThemeColor('tint');
    const surface = getThemeColor('surface');
    const glassBorder = getThemeColor('glassBorder');

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: glassBorder }]}>
                <Text style={[styles.headerTitle, { color: textMain }]}>Terms of Use</Text>
                <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
                    <Text style={[styles.closeText, { color: accent }]}>Close</Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <Text style={[styles.lastUpdated, { color: textSec }]}>Last updated: May 2026</Text>

                <View style={[styles.card, { backgroundColor: surface, borderColor: glassBorder }]}>
                    <Text style={[styles.cardText, { color: textSec }]}>
                        By creating an account on Nimly, you agree to these Terms of Use.
                        Anonymity does not mean freedom from responsibility — you are accountable for what you post.
                    </Text>
                </View>

                <Section title="1. Eligibility" accent={accent}>
                    <Body color={textSec}>
                        You must be at least 17 years old to use Nimly. By registering, you confirm that you meet this requirement.
                    </Body>
                </Section>

                <Section title="2. Anonymous Use" accent={accent}>
                    <Body color={textSec}>
                        Nimly allows anonymous participation. However, anonymity does not grant immunity from these Terms.
                        You are responsible for all content you post, regardless of your identity.
                    </Body>
                </Section>

                <Section title="3. Acceptable Use" accent={accent}>
                    <Body color={textSec}>You agree NOT to use Nimly to:</Body>
                    <BulletList color={textSec} items={[
                        'Harass, threaten, or abuse other users',
                        'Post illegal content of any kind',
                        'Share content promoting violence, self-harm, or discrimination',
                        'Impersonate another person or entity',
                        'Attempt to de-anonymize other users',
                        'Spam or post repetitive low-quality content',
                        'Exploit, hack, or disrupt the platform',
                    ]} />
                </Section>

                <Section title="4. Content Ownership" accent={accent}>
                    <Body color={textSec}>
                        You retain ownership of the content you post. By posting on Nimly, you grant us a
                        non-exclusive, royalty-free license to display and moderate that content within the app.
                    </Body>
                </Section>

                <Section title="5. Content Moderation" accent={accent}>
                    <Body color={textSec}>
                        We reserve the right to remove any content that violates these Terms. We aim to act on
                        reported content within 24 hours. Users who violate these Terms may be suspended or
                        permanently banned without notice.
                    </Body>
                </Section>

                <Section title="6. Reporting & Blocking" accent={accent}>
                    <Body color={textSec}>
                        The app provides mechanisms to report objectionable content and block abusive users.
                        All reports are reviewed by the developer within 24 hours.
                    </Body>
                </Section>

                <Section title="7. Disclaimer of Warranties" accent={accent}>
                    <Body color={textSec}>
                        Nimly is provided "as is" without warranties of any kind. We do not guarantee
                        uninterrupted service or that the platform will be free of errors.
                    </Body>
                </Section>

                <Section title="8. Limitation of Liability" accent={accent}>
                    <Body color={textSec}>
                        To the maximum extent permitted by law, we are not liable for any indirect, incidental,
                        or consequential damages arising from your use of Nimly.
                    </Body>
                </Section>

                <Section title="9. Changes to These Terms" accent={accent}>
                    <Body color={textSec}>
                        We reserve the right to modify these Terms at any time. Continued use of Nimly after
                        changes means you accept the updated Terms.
                    </Body>
                </Section>

                <Section title="10. Contact" accent={accent}>
                    <Body color={textSec}>
                        Questions? Reach us at github.com/TheJemv/Nimly/issues
                    </Body>
                </Section>

                <View style={styles.bottomSpacer} />
            </ScrollView>

            {/* Bottom close button */}
            <View style={[styles.bottomBar, { borderTopColor: glassBorder, backgroundColor: bg }]}>
                <TouchableOpacity
                    style={[styles.closeFullBtn, { backgroundColor: accent }]}
                    onPress={() => router.back()}
                >
                    <Text style={styles.closeFullBtnText}>I UNDERSTAND</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

// ——— Helper components ———

function Section({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
    return (
        <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: accent }]}>{title}</Text>
            {children}
        </View>
    );
}

function Body({ color, children }: { color: string; children: React.ReactNode }) {
    return <Text style={[styles.body, { color }]}>{children}</Text>;
}

function BulletList({ items, color }: { items: string[]; color: string }) {
    return (
        <View style={styles.bulletList}>
            {items.map((item, i) => (
                <View key={i} style={styles.bulletRow}>
                    <Text style={[styles.bullet, { color }]}>•</Text>
                    <Text style={[styles.bulletText, { color }]}>{item}</Text>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingVertical: 16,
        borderBottomWidth: 1,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    closeBtn: {
        padding: 4,
    },
    closeText: {
        fontSize: 15,
        fontWeight: '600',
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingTop: 20,
    },
    lastUpdated: {
        fontSize: 12,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginBottom: 16,
    },
    card: {
        borderRadius: 10,
        borderWidth: 1,
        padding: 16,
        marginBottom: 28,
    },
    cardText: {
        fontSize: 14,
        lineHeight: 22,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        marginBottom: 8,
    },
    body: {
        fontSize: 14,
        lineHeight: 22,
    },
    bulletList: {
        marginTop: 6,
        gap: 6,
    },
    bulletRow: {
        flexDirection: 'row',
        gap: 8,
    },
    bullet: {
        fontSize: 14,
        lineHeight: 22,
    },
    bulletText: {
        fontSize: 14,
        lineHeight: 22,
        flex: 1,
    },
    bottomSpacer: {
        height: 20,
    },
    bottomBar: {
        paddingHorizontal: 24,
        paddingVertical: 16,
        borderTopWidth: 1,
    },
    closeFullBtn: {
        height: 52,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeFullBtnText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
});