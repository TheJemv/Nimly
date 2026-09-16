/**
 * Cleans up a message's text before it is sent.
 * - Trims whitespace and line breaks from the start and end.
 * - Optional: Reduces multiple consecutive line breaks to a maximum of two (one visual space).
 */
export const cleanChatMessage = (text: string): string => {
  if (!text) return '';

  // 1. Trim leading/trailing whitespace and line breaks
  let cleanedText = text.trim();

  // 2. Replace 3 or more consecutive line breaks with a maximum of 2
  // This prevents sending "Hi [100 line breaks] Bye"
  cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n');

  return cleanedText;
};

/**
 * Validates whether the message is valid to send (not empty and not just whitespace/line breaks).
 */
export const isValidMessage = (text: string): boolean => {
  if (!text) return false;

  // If it's empty after trimming whitespace, it's not valid
  return text.trim().length > 0;
};