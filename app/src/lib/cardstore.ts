import { getItem, setItem } from './storage';

// The creator keeps each card's secret on their phone so they can share the link again.
const KEY = 'showup.cards.v1';

export async function saveCardSecret(publicKey: string, secret: string) {
  const all = await loadCardSecrets();
  all[publicKey] = secret;
  await setItem(KEY, JSON.stringify(all));
}

export async function loadCardSecrets(): Promise<Record<string, string>> {
  const raw = await getItem(KEY);
  return raw ? JSON.parse(raw) : {};
}
