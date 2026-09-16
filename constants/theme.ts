/**
 * Official colors for Floxly - "Crimson Glass VIP" aesthetic
 * Configured exclusively for Dark Mode to maintain maximum privacy.
 */

import { Platform } from 'react-native';

// The AccentPrimary: Crimson / Ruby Red (high contrast, exclusive, and eye-catching)
const tintColorDark = '#DC143C';

const darkPalette = {
    // --- Typography ---
    text: '#F2E8D8',             // Ivory for smooth reading, easy on the eyes, and looks premium
    textSecondary: '#8A8A8A',    // Muted neutral gray for secondary information

    // --- Backgrounds and Surfaces ---
    background: '#000000',       // Onyx black: the deep black of haute couture
    surface: '#161616',          // Very subtle charcoal gray to add depth to base cards

    // --- Accents and Icons ---
    tint: tintColorDark,
    icon: '#4A4A4A',             // Very discreet inactive icons to keep the private vibe
    tabIconDefault: '#4A4A4A',
    tabIconSelected: tintColorDark, // The Crimson will shine to guide the user
    activeIcon: tintColorDark,

    // --- "Liquid Glass" effect (premium glassmorphism) ---
    // Subtle reflections using the Crimson's RGB code (220, 20, 60)
    // This gives the dark glass a very slight reddish tint, very elegant.
    glassBorder: 'rgba(220, 20, 60, 0.15)',
    glassBackground: 'rgba(220, 20, 60, 0.03)',
    glassHighlight: 'rgba(220, 20, 60, 0.10)',

    // --- Semantic Feedback ---
    error: tintColorDark,        // Same brand Crimson: unifies destructive/error into a single red
    success: '#4CAF7D',          // Desaturated jade green, curated to not clash with the Crimson/Gold
    warning: '#C9A227',          // Old gold

    // --- Additional neutrals ---
    border: '#2A2A2A',           // Subtle separators/borders over the Onyx black
};

/**
 * Nimly is a dark-only app (see app.json → userInterfaceStyle: "dark").
 * We expose `light` and `dark` with the SAME palette so any consumer
 * (e.g. useThemeColor) stays safe even if useColorScheme() returns 'light'
 * or null during the first render.
 */
export const Colors = {
  dark: darkPalette,
  light: darkPalette,
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

export const getThemeColor = (colorName: keyof typeof Colors.dark) => {
  return Colors.dark[colorName];
};