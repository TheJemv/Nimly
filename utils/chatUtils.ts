import type { KlipyGif } from '@/api/klipy/gifs';

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
// GIF messages only ever render from KLIPY's CDN: a GIF row is plain text in
// the DB, so anything else in it would make the recipient's app fetch an
// arbitrary URL (and leak their IP to whoever controls it).
const GIF_HOST = 'https://static.klipy.com/';

/**
 * The `content` of a GIF message: the GIF's URL, with its pixel size after `#`
 * so the bubble can be laid out at the right size before the GIF loads.
 */
export const buildGifContent = (gif: KlipyGif): string | null => {
  const media = gif.media_formats.mediumgif ?? gif.media_formats.gif ?? gif.media_formats.tinygif;
  if (!media?.url.startsWith(GIF_HOST)) return null;
  const [w, h] = media.dims;
  return `${media.url}#w=${w}&h=${h}`;
};

/** Reverses `buildGifContent`. Null when the content isn't a KLIPY GIF URL. */
export const parseGifContent = (content: string | null | undefined): { url: string; width?: number; height?: number } | null => {
  if (!content?.startsWith(GIF_HOST)) return null;
  const [url, fragment = ''] = content.split('#');
  const size = /^w=(\d+)&h=(\d+)$/.exec(fragment);
  return size ? { url, width: Number(size[1]), height: Number(size[2]) } : { url };
};
