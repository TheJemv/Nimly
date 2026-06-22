/**
 * Limpia el texto de un mensaje antes de ser enviado.
 * - Elimina espacios y saltos de línea al inicio y al final.
 * - Opcional: Reduce múltiples saltos de línea consecutivos a máximo dos (un espacio visual).
 */
export const cleanChatMessage = (text: string): string => {
  if (!text) return '';

  // 1. Elimina espacios en blanco y saltos de línea al principio y al final
  let cleanedText = text.trim();

  // 2. Reemplaza 3 o más saltos de línea consecutivos por máximo 2
  // Esto evita que envíen "Hola [100 saltos de línea] Adiós"
  cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n');

  return cleanedText;
};

/**
 * Valida si el mensaje es válido para enviar (no está vacío ni son solo espacios/saltos de línea).
 */
export const isValidMessage = (text: string): boolean => {
  if (!text) return false;
  
  // Si después de quitar espacios queda vacío, no es válido
  return text.trim().length > 0;
};