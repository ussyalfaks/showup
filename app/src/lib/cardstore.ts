import { getItem, setItem } from './storage';
import { protectedCardLink } from './cardcode';

// The creator keeps what's needed to share each card again on their phone.
// Older cards store the bare secret; cards with a redeem code store {c, code}.
const KEY = 'showup.cards.v1';

export async function saveCardSecret(publicKey: string, secret: string) {
  const all = await loadCardSecrets();
  all[publicKey] = secret;
  await setItem(KEY, JSON.stringify(all));
}

export const saveProtectedCard = (publicKey: string, linkSecret: string, code: string) =>
  saveCardSecret(publicKey, JSON.stringify({ c: linkSecret, code }));

export async function loadCardSecrets(): Promise<Record<string, string>> {
  const raw = await getItem(KEY);
  return raw ? JSON.parse(raw) : {};
}

/** What the creator can share for a card: the link, and the redeem code if it has one. */
export function shareInfo(publicKey: string, stored: string, oldLink: (secret: string) => string): { link: string; code: string | null } {
  if (stored.startsWith('{')) {
    const { c, code } = JSON.parse(stored) as { c: string; code: string };
    return { link: protectedCardLink(c, publicKey), code };
  }
  return { link: oldLink(stored), code: null };
}
