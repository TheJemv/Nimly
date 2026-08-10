import { getThemeColor } from '@/constants/theme';
import { Stack } from 'expo-router';

export default function HomeLayout() {
    return (
        <Stack
            screenOptions={{
                headerBackButtonDisplayMode: 'minimal',
                headerStyle: { backgroundColor: getThemeColor("background") },
                contentStyle: { backgroundColor: getThemeColor("background") },
            }}
        >
            <Stack.Screen name='index' />
            <Stack.Screen name='notifications' />
        </Stack>
    );
}