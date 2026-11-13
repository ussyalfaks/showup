// NEAR Social (SocialDB) integration, called directly with near-api-js.
// Reads are free contract views; writes are `set` calls signed by the user.
import type { Account } from 'near-api-js';
import { CONTRACT_ID, NETWORK } from './config';
import { provider } from './near';

export const SOCIAL_CONTRACT = process.env.EXPO_PUBLIC_SOCIAL_CONTRACT ?? (NETWORK === 'mainnet' ? 'social.near' : 'v1.social08.testnet');
export const SOCIAL_WEB = NETWORK === 'mainnet' ? 'https://near.social' : 'https://test.near.social';
/** Covers first-time storage on SocialDB; the unused part is refunded. */
const SOCIAL_DEPOSIT = 5n * 10n ** 22n; // 0.05 NEAR

export interface Profile {
  name?: string;
  image?: { ipfs_cid?: string; url?: string; nft?: { contractId: string; tokenId: string } };
}

type Tree = Record<string, any>;

async function socialGet(keys: string[]): Promise<Tree> {
  if (!keys.length) return {};
  const r = (await provider.callFunction({ contractId: SOCIAL_CONTRACT, method: 'get', args: { keys } })) as Tree | null;
  return r ?? {};
}

const cache = new Map<string, Profile | null>();

/** Names and images for many accounts in one call. Missing profiles come back as null. */
export async function getProfiles(accounts: string[]): Promise<Record<string, Profile | null>> {
  const want = [...new Set(accounts)].filter((a) => a && !cache.has(a));
  if (want.length) {
    try {
      const data = await socialGet(want.flatMap((a) => [`${a}/profile/name`, `${a}/profile/image/**`]));
      for (const a of want) {
        const p = data[a]?.profile;
        cache.set(a, p && (p.name || p.image) ? { name: p.name, image: p.image } : null);
      }
    } catch {
      for (const a of want) cache.set(a, null);
    }
  }
  return Object.fromEntries(accounts.map((a) => [a, cache.get(a) ?? null]));
}

export function imageUrl(image: Profile['image']): string | null {
  if (!image) return null;
  if (image.ipfs_cid) return `https://ipfs.near.social/ipfs/${image.ipfs_cid}`;
  if (image.url?.startsWith('https://')) return image.url;
  return null;
}

export const isImplicit = (a: string) => /^[0-9a-f]{64}$/.test(a);

const hashtagsOf = (text: string) => [...new Set((text.match(/#([a-zA-Z][a-zA-Z0-9_]*)/g) ?? []).map((t) => t.slice(1).toLowerCase()))];
const mentionsOf = (text: string) => [...new Set((text.match(/@([a-z0-9_\-.]+\.(near|testnet)|[0-9a-f]{64})/g) ?? []).map((m) => m.slice(1)))];

/** The `set` payload for a NEAR Social post, in the same shape near.social and near-social-js use. */
export function buildPost(accountId: string, text: string, extra: Tree = {}): Tree {
  const index: Tree = { post: JSON.stringify({ key: 'main', value: { type: 'md' } }) };
  const tags = hashtagsOf(text);
  if (tags.length) index.hashtag = JSON.stringify(tags.map((key) => ({ key, value: { type: 'social', path: `${accountId}/post/main` } })));
  const mentions = mentionsOf(text).filter((m) => m !== accountId);
  if (mentions.length) {
    index.notify = JSON.stringify(mentions.map((key) => ({ key, value: { type: 'mention', item: { type: 'social', path: `${accountId}/post/main` } } })));
  }
  return { [accountId]: { post: { main: JSON.stringify({ type: 'md', text }) }, index, ...extra } };
}

export async function postToSocial(account: Account, accountId: string, text: string, extra: Tree = {}) {
  return account.callFunction({
    contractId: SOCIAL_CONTRACT,
    methodName: 'set',
    args: { data: buildPost(accountId, text, extra), options: { refund_unused_deposit: true } },
    deposit: SOCIAL_DEPOSIT,
    gas: 100n * 10n ** 12n,
  });
}

// ---------------------------------------------------------------- ShowUp-specific

export interface SharedEvent {
  host: string;
  eventId: string;
  text: string;
}

/** Post an event to the public feed (#showup) and record it under `<host>/showup/event/<id>`. */
export async function shareEvent(account: Account, host: string, eventId: string, text: string) {
  const record = JSON.stringify({ contract: CONTRACT_ID, event_id: eventId, text });
  return postToSocial(account, host, text, { showup: { event: { [eventId]: record } } });
}

/** Events any host shared, read straight from SocialDB (works on testnet and mainnet, no indexer). */
export async function getSharedEvents(): Promise<SharedEvent[]> {
  const data = await socialGet(['*/showup/event/*']);
  const out: SharedEvent[] = [];
  for (const [host, v] of Object.entries(data)) {
    for (const [eventId, raw] of Object.entries((v as Tree)?.showup?.event ?? {})) {
      try {
        const r = JSON.parse(String(raw));
        if (r.contract === CONTRACT_ID) out.push({ host, eventId, text: String(r.text ?? '') });
      } catch {
        /* ignore malformed entries */
      }
    }
  }
  return out.sort((a, b) => Number(b.eventId) - Number(a.eventId));
}

export function eventPostText(e: { title: string; location: string; startsAt: Date; deposit: string; split: boolean }) {
  const when = e.startsAt.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `📍 ${e.title} — ${when}${e.location ? `, ${e.location}` : ''}\n\nRSVP with ${e.deposit}. Show up and get it back${e.split ? ' plus a share of what the no-shows leave behind' : ''}. #showup #near`;
}

export function shoutOutText(title: string, attended: string[], total: number) {
  const named = attended.filter((a) => !isImplicit(a));
  const tags = named.slice(0, 20).map((a) => `@${a}`).join(' ');
  return `🙌 ${attended.length} of ${total} showed up to ${title}. Thank you for coming!${tags ? `\n\n${tags}` : ''}\n\n#showup`;
}
