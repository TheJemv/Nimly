/**
 * Colores oficiales para Floxly - Estética "Crimson Glass VIP"
 * Configurado exclusivamente para Dark Mode para mantener máxima privacidad.
 */

import { Platform } from 'react-native';

// El AccentPrimary: Carmesí / Rojo Rubí (Alto contraste, exclusivo y llamativo)
const tintColorDark = '#DC143C';

const darkPalette = {
    // --- Tipografía ---
    text: '#F2E8D8',             // Marfil (Ivory) para una lectura suave, descansa la vista y se ve premium
    textSecondary: '#8A8A8A',    // Gris neutro apagado para información secundaria

    // --- Fondos y Superficies ---
    background: '#000000',       // Negro Ónix: El negro profundo de la alta costura
    surface: '#161616',          // Gris carbón levísimo para darle profundidad a las tarjetas base

    // --- Acentos e Íconos ---
    tint: tintColorDark,
    icon: '#4A4A4A',             // Íconos inactivos muy discretos para mantener la vibra privada
    tabIconDefault: '#4A4A4A',
    tabIconSelected: tintColorDark, // El Carmesí brillará guiando al usuario
    activeIcon: tintColorDark,

    // --- Efecto "Liquid Glass" (Premium Glassmorphism) ---
    // Reflejos sutiles usando el código RGB del Carmesí (220, 20, 60)
    // Esto hace que el cristal oscuro tenga un levísimo tinte rojizo, muy elegante.
    glassBorder: 'rgba(220, 20, 60, 0.15)',
    glassBackground: 'rgba(220, 20, 60, 0.03)',
    glassHighlight: 'rgba(220, 20, 60, 0.10)',

    // --- Feedback Semántico ---
    error: '#8B1538',            // Borgoña oscuro (para no competir con el brillo de tu Carmesí)
    success: '#D6B98C',          // Oro champaña para confirmaciones con un toque de lujo
    warning: '#C9A227',          // Oro viejo
};

/**
 * Nimly es una app dark-only (ver app.json → userInterfaceStyle: "dark").
 * Exponemos `light` y `dark` con la MISMA paleta para que cualquier consumidor
 * (p. ej. useThemeColor) sea seguro aunque useColorScheme() devuelva 'light'
 * o null durante el primer render.
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