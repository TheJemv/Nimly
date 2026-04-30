import { getThemeColor } from '@/constants/theme';
import { Stack } from 'expo-router';

export default function HomeLayout() {
    return (
        <Stack screenOptions={{
            headerShown: false
        }}>
            <Stack.Screen
                name='index'
                options={{
                    headerShown: true
                }}
            />
            <Stack.Screen
                name='friends'
                options={{
                    presentation: "modal",
                    headerShown: true,
                    headerTitle: "",
                    headerShadowVisible: true,
                    headerTransparent: true,
                    headerStyle: {
                        backgroundColor: getThemeColor("background")
                    }
                }}
            />
        </Stack>
    );
}