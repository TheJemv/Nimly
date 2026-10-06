// src/services/klipy/client.ts

const BASE_URL = "https://api.klipy.com/v2";
const API_KEY = process.env.EXPO_PUBLIC_KLIPY_API_KEY;

/**
 * Base client to fetch data from the Klipy API.
 * Automatically injects the API Key into the request parameters.
 */
export const klipyFetch = async (
    endpoint: string,
    params: Record<string, string | number> = {},
) => {
    if (!API_KEY) {
        console.error(
            "Klipy API Key is missing in the environment variables (.env)",
        );
        return null;
    }

    const queryParams = new URLSearchParams({
        ...params,
        key: API_KEY,
    } as Record<string, string>);

    const url = `${BASE_URL}${endpoint}?${queryParams.toString()}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(
                `Klipy API Error: ${response.status} ${response.statusText}`,
            );
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`[Klipy API] Failed to fetch ${endpoint}:`, error);
        throw error;
    }
};
