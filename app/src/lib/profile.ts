// In-app NEAR Social profile: name and photo, edited and published without leaving ShowUp.
// The profile lives at `<account>/profile` in SocialDB, the same place near.social reads it,
// so it works for named and implicit (64-hex) accounts alike.
import type { Account } from 'near-api-js';
import { KeyPair, type KeyPairString } from 'near-api-js';
import { NETWORK } from './config';
import { implicitIdFor } from './near';
import { SOCIAL_CONTRACT, forgetProfile } from './social';

const IPFS_ADD = 'https://ipfs.near.social/add';
const FASTNEAR_API = NETWORK === 'mainnet' ? 'https://api.fastnear.com' : 'https://test.api.fastnear.com';
/** Covers first-time profile storage on SocialDB; the unused part is refunded. */
const PROFILE_DEPOSIT = 2n * 10n ** 22n; // 0.02 NEAR
/**
 * NEAR reserves attached gas at ~0.001 NEAR per Tgas up front (refunded after), so 100 Tgas
 * would need 0.1 NEAR on hand: too much for a wallet funded by a small gift card.
 * A SocialDB `set` of a profile uses well under 30 Tgas.
 */
const PROFILE_GAS = 30n * 10n ** 12n;

export interface ProfileInput {
  name: string;
  /** IPFS CID of the photo, already uploaded. */
  imageCid?: string | null;
}

/** Upload a picked photo to NEAR Social's IPFS gateway. Free, no NEAR needed. Returns the CID. */
export async function uploadImage(uri: string, mimeType = 'image/jpeg'): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  const res = await fetch(IPFS_ADD, { method: 'POST', headers: { 'Content-Type': mimeType, Accept: 'application/json' }, body: blob });
  if (!res.ok) throw new Error(`Photo upload failed (${res.status}). Try again.`);
  const { cid } = (await res.json()) as { cid?: string };
  if (!cid) throw new Error('Photo upload failed. Try again.');
  return cid;
}

/** The SocialDB `set` payload for a profile. */
export function buildProfile(accountId: string, p: ProfileInput) {
  const profile: Record<string, unknown> = { name: p.name.trim() };
  if (p.imageCid) profile.image = { ipfs_cid: p.imageCid };
  return { [accountId]: { profile } };
}

/** Publish name and photo to NEAR Social. Needs a funded account (~0.01 NEAR storage, rest refunded). */
export async function saveProfile(account: Account, accountId: string, p: ProfileInput) {
  if (!p.name.trim()) throw new Error('Add your name');
  const r = await account.callFunction({
    contractId: SOCIAL_CONTRACT,
    methodName: 'set',
    args: { data: buildProfile(accountId, p), options: { refund_unused_deposit: true } },
    deposit: PROFILE_DEPOSIT,
    gas: PROFILE_GAS,
  });
  forgetProfile(accountId);
  return r;
}

/**
 * Which accounts a private key controls, so importing needs only the key.
 * Asks FastNEAR's public-key index; an unused key maps to its own implicit account.
 */
export async function accountsForKey(secretKey: string): Promise<string[]> {
  const publicKey = KeyPair.fromString(secretKey.trim() as KeyPairString).getPublicKey().toString();
  try {
    const r = await fetch(`${FASTNEAR_API}/v0/public_key/${publicKey}`);
    const { account_ids } = (await r.json()) as { account_ids?: string[] };
    if (account_ids?.length) return account_ids;
  } catch {
    /* index unavailable: fall back to the implicit account */
  }
  return [implicitIdFor(publicKey)];
}
