import { getThemeColor } from '@/constants/theme';
import { Stack } from 'expo-router';

export default function ProfileLayout() {
    return (
        <Stack
            screenOptions={{
                headerShadowVisible: false,
                headerTintColor: getThemeColor("text"),
                headerBackButtonDisplayMode: 'minimal',
                headerStyle: {
                    backgroundColor: getThemeColor("background"),
                },
                headerTitleStyle: {
                    color: getThemeColor("text"),
                },
            }}
        >
            <Stack.Screen name='index' />
            <Stack.Screen name='settings' />
            <Stack.Screen name='avatar-select' options={{ headerTitle: "" }} />
            <Stack.Screen name='friends'
                options={{
                    headerTitle: "Friends"
                }}
            />
        </Stack>
    );
}