import { getThemeColor } from "@/constants/theme";
import { Stack } from "expo-router";

export default function RootLayout() {
    return (
        <Stack initialRouteName="index"
            screenOptions={{
                headerShadowVisible: false,
                title: "",
                headerStyle: {
                    backgroundColor: getThemeColor("background")
                },
            }}
        >
            <Stack.Screen name="index"
                options={{
                    headerShown: false
                }}
            />
            <Stack.Screen name="login" />
            <Stack.Screen name="register" />
        </Stack>
    )
}