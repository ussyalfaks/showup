// Links people share (gift cards, events) and how they're shared.
import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';

/**
 * Where shared links point.
 * - On the website: the site itself (window.location.origin), so links open the web app.
 * - In the phone app: EXPO_PUBLIC_WEB_URL (e.g. https://showup.vercel.app) once it's set, so
 *   people without the app can open them in a browser; otherwise the app's showup:// scheme.
 */
export function linkBase(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  const web = process.env.EXPO_PUBLIC_WEB_URL;
  return web ? web.replace(/\/+$/, '') : 'showup://';
}

/** linkBase() + path, e.g. appLink('event/5') -> https://site/event/5 or showup://event/5 */
export function appLink(path: string): string {
  const base = linkBase();
  const p = path.replace(/^\/+/, '');
  return base.endsWith('://') ? `${base}${p}` : `${base}/${p}`;
}

/**
 * Open the share sheet, or copy the message where there is none (most desktop browsers).
 * The caller tells the person what happened: 'copied' means "Link copied".
 */
export async function shareOrCopy(message: string): Promise<'shared' | 'copied' | 'cancelled'> {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: unknown }) : undefined;
  const canShare = Platform.OS !== 'web' || typeof nav?.share === 'function';
  if (canShare) {
    try {
      const r = await Share.share({ message });
      return r.action === Share.dismissedAction ? 'cancelled' : 'shared';
    } catch (e) {
      // Web: the person closed the share sheet, or the browser refused; fall back to copying.
      if (Platform.OS !== 'web') throw e;
      if (/abort/i.test(String((e as Error)?.name ?? e))) return 'cancelled';
    }
  }
  await Clipboard.setStringAsync(message);
  return 'copied';
}
