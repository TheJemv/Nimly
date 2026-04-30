import { Stack } from 'expo-router';

export default function HomeLayout() {
    return (
        <Stack
            screenOptions={{
                headerBackButtonDisplayMode: 'minimal',
            }}
        >
            <Stack.Screen name='index' />
            <Stack.Screen name='notifications' />
        </Stack>
    );
}