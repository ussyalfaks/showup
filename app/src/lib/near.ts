import { Account, JsonRpcProvider, KeyPair, PublicKey, type KeyPairString } from 'near-api-js';
import { Buffer } from 'buffer';
import { CONTRACT_ID, RPC_BACKUP_URL, RPC_URL } from './config';


// Reads (views, balances, keys) are safe to repeat. Try the main RPC briefly, then the backup,
// but only for network trouble: a real answer like "account doesn't exist" is passed straight on.
const readMain = new JsonRpcProvider({ url: RPC_URL }, { retries: 2, wait: 400, backoff: 2 });
const readBackup = new JsonRpcProvider({ url: RPC_BACKUP_URL }, { retries: 3, wait: 600, backoff: 2 });
const NETWORK_TROUBLE = /rate limit|too many requests|\b429\b|RetriesExceeded|Exceeded \d+ attempts|unavailable|Bad Gateway|Internal server error|Timeout error|Network request failed|Failed to fetch|fetch failed|Load failed|ERR_CONNECTION/i;
export const isNetworkTrouble = (e: unknown) => {
  const err = e as { message?: string; cause?: unknown };
  return NETWORK_TROUBLE.test(String(err?.message ?? e)) || [408, 429, 500, 502, 503].includes(err?.cause as number);
};
// After the main RPC refuses us, go straight to the backup for a minute instead of paying its
// retries on every read, then give the main RPC another chance.
const COOLDOWN_MS = 60_000;
let mainBlockedUntil = 0;
/** For tests: forget a previous refusal. */
export const resetReadCooldown = () => {
  mainBlockedUntil = 0;
};
/**
 * Provider for transactions (and anything else near-api-js asks of it). On network trouble it
 * repeats the *same* call on the backup RPC. Re-sending the same signed transaction is safe on
 * NEAR: its nonce means it can execute at most once. Real answers (a contract error, a bad
 * nonce) are passed straight on and never retried elsewhere.
 */
const txMain = new JsonRpcProvider({ url: RPC_URL }, { retries: 3, wait: 500, backoff: 2 });
const txBackup = new JsonRpcProvider({ url: RPC_BACKUP_URL });
export const provider: JsonRpcProvider = new Proxy(txMain, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value !== 'function') return value;
    return async (...args: unknown[]) => {
      if (Date.now() >= mainBlockedUntil) {
        try {
          return await value.apply(target, args);
        } catch (e) {
          if (!isNetworkTrouble(e)) throw e;
          mainBlockedUntil = Date.now() + COOLDOWN_MS;
        }
      }
      const backup = Reflect.get(txBackup, prop) as (...a: unknown[]) => unknown;
      return backup.apply(txBackup, args);
    };
  },
});

export async function read<T>(fn: (p: JsonRpcProvider) => Promise<T>): Promise<T> {
  if (Date.now() < mainBlockedUntil) return fn(readBackup);
  try {
    return await fn(readMain);
  } catch (e) {
    if (!isNetworkTrouble(e)) throw e;
    mainBlockedUntil = Date.now() + COOLDOWN_MS;
    return fn(readBackup);
  }
}

// ---------------------------------------------------------------- types

export interface Card {
  public_key: string;
  creator: string;
  asset: string;
  amount: string;
  message: string;
  funded: boolean;
  claimed_by: string | null;
  cancelled: boolean;
  created_at: string;
}

export interface Event {
  id: string;
  host: string;
  title: string;
  location: string;
  starts_at: string;
  checkin_until: string;
  asset: string;
  deposit: string;
  capacity: number;
  policy: 'split_attendees' | 'host';
  reliable: { min_events: number; min_rate_pct: number; discount_pct: number } | null;
  checkers: string[];
  guests: string[];
  attended: number;
  cancelled: boolean;
  settled: boolean;
  pot: string;
  share: string;
  host_take: string;
  host_withdrawn: boolean;
}

export interface Rsvp {
  paid: string;
  ticket_key: string;
  checked_in: boolean;
  withdrawn: boolean;
  at: string;
}

export interface Attendance {
  rsvps: number;
  attended: number;
  no_shows: number;
  hosted: number;
}

// ---------------------------------------------------------------- reads

export async function view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  return (await read((p) => p.callFunction({ contractId: CONTRACT_ID, method, args }))) as T;
}

/** Balance in yoctoNEAR, or null if the account doesn't exist yet. */
export async function nearBalance(accountId: string): Promise<bigint | null> {
  try {
    const a = (await read((p) => p.viewAccount({ accountId, blockQuery: { finality: 'optimistic' } }))) as unknown as { amount: bigint | string };
    return BigInt(a.amount);
  } catch (e) {
    // Only "no such account" means not activated yet; network trouble must not look like 0 NEAR.
    if (isNetworkTrouble(e)) throw e;
    return null;
  }
}

// ---------------------------------------------------------------- writes

export function signer(accountId: string, secretKey: string) {
  return new Account(accountId, provider, secretKey as KeyPairString);
}

export async function call<T = unknown>(
  account: Account,
  methodName: string,
  args: Record<string, unknown>,
  opts: { deposit?: bigint; tgas?: number; contractId?: string } = {},
): Promise<T> {
  return (await account.callFunction({
    contractId: opts.contractId ?? CONTRACT_ID,
    methodName,
    args,
    deposit: opts.deposit ?? 0n,
    gas: BigInt(opts.tgas ?? 100) * 10n ** 12n,
  })) as T;
}

// ---------------------------------------------------------------- keys & accounts

/** A brand-new implicit account: the account id is the hex of the public key. */
export function newImplicitAccount() {
  const kp = KeyPair.fromRandom('ed25519');
  return { accountId: implicitIdFor(kp.getPublicKey().toString()), secretKey: kp.toString() };
}

export function implicitIdFor(publicKey: string) {
  return Buffer.from(PublicKey.fromString(publicKey).data).toString('hex');
}

export function publicKeyOf(secretKey: string) {
  return KeyPair.fromString(secretKey as KeyPairString).getPublicKey().toString();
}

// ---------------------------------------------------------------- cards

export const CARD_LINK_PREFIX = 'showup://claim?k=';

/** Fresh key pair for a card. The secret goes in the link, the public key on-chain. */
export function newCardKey() {
  const kp = KeyPair.fromRandom('ed25519');
  return { publicKey: kp.getPublicKey().toString(), secret: kp.toString().replace('ed25519:', '') };
}

export const cardLink = (secret: string) => `${CARD_LINK_PREFIX}${secret}`;

/** Accepts a full link, a "k=" fragment, or the bare secret. */
export function parseCardSecret(input: string): string | null {
  const t = input.trim();
  const m = t.match(/[?&#]k=([1-9A-HJ-NP-Za-km-z]+)/);
  const s = m ? m[1] : t.replace(/^ed25519:/, '');
  return /^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(s) ? s : null;
}

/** Claim a card with the secret from its link. Signed by the card's own key on the contract account. */
/**
 * Claim gas must fit the card key's allowance: NEAR checks the allowance against the gas
 * attached at about 0.001 NEAR per Tgas (measured on testnet, protocol 88).
 * Needed: a NEAR claim to a brand-new implicit account ~20 Tgas (account creation alone is
 * 7.2 Tgas); a token claim ~38 Tgas. Keys get 0.03 / 0.05 NEAR from the contract.
 */
export const claimGas = (asset: string) => (asset === 'near' ? 25n : 45n) * 10n ** 12n;
const ALLOWANCE_PER_TGAS = 10n ** 21n; // 0.001 NEAR

/** Remaining allowance on a card's claim key, or null if the key is gone (claimed or cancelled). */
export async function cardKeyAllowance(publicKey: string): Promise<bigint | null> {
  try {
    const k = await read((p) => p.viewAccessKey({ accountId: CONTRACT_ID, publicKey }));
    const fc = (k.permission as { FunctionCall?: { allowance?: string | bigint | null } }).FunctionCall;
    return fc?.allowance != null ? BigInt(fc.allowance) : null;
  } catch {
    return null;
  }
}

export async function claimCard(secret: string, receiverId: string, asset: string) {
  // Never attach more gas than the key's allowance covers: the network would reject it.
  // (Cards made before the allowance increase still claim fine into existing accounts.)
  let gas = claimGas(asset);
  const left = await cardKeyAllowance(cardPublicKey(secret));
  if (left !== null) {
    const fits = (left / ALLOWANCE_PER_TGAS - 1n) * 10n ** 12n;
    if (fits < gas) gas = fits;
  }
  const asContract = new Account(CONTRACT_ID, provider, `ed25519:${secret}` as KeyPairString);
  return asContract.callFunction({ contractId: CONTRACT_ID, methodName: 'claim', args: { receiver_id: receiverId }, gas });
}

export function cardPublicKey(secret: string) {
  return KeyPair.fromString(`ed25519:${secret}` as KeyPairString).getPublicKey().toString();
}

// ---------------------------------------------------------------- check-in QR

/** Must match `checkin_message` in the contract exactly. */
export const checkinMessage = (eventId: string, guest: string, tsMs: number) =>
  `showup-checkin:${CONTRACT_ID}:${eventId}:${guest}:${tsMs}`;

export interface CheckinQr {
  t: 'showup-checkin';
  e: string;
  g: string;
  ts: number;
  s: string;
}

/** What the guest's phone shows at the door. Re-signed every few seconds. */
export function signCheckin(secretKey: string, eventId: string, guest: string, tsMs = Date.now()): CheckinQr {
  const kp = KeyPair.fromString(secretKey as KeyPairString);
  const { signature } = kp.sign(new TextEncoder().encode(checkinMessage(eventId, guest, tsMs)));
  return { t: 'showup-checkin', e: eventId, g: guest, ts: tsMs, s: Buffer.from(signature).toString('base64') };
}

export function parseCheckin(data: string): CheckinQr | null {
  try {
    const v = JSON.parse(data);
    return v?.t === 'showup-checkin' && typeof v.g === 'string' && typeof v.s === 'string' ? (v as CheckinQr) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- send

export const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
export const validAccountId = (a: string) => a.length >= 2 && a.length <= 64 && ACCOUNT_RE.test(a);

/** Accepts "bob.near", a 64-hex implicit account, or "near:bob.near" from a QR. */
export function parseAddress(input: string): string | null {
  const a = input.trim().replace(/^near:/i, '').toLowerCase();
  return validAccountId(a) ? a : null;
}

export async function ftBalance(token: string, accountId: string): Promise<bigint> {
  try {
    const r = (await read((p) => p.callFunction({ contractId: token, method: 'ft_balance_of', args: { account_id: accountId } }))) as string;
    return BigInt(r ?? '0');
  } catch {
    return 0n;
  }
}

/** Keep a little NEAR for gas and the account's own storage. */
export const NEAR_RESERVE = 5n * 10n ** 22n; // 0.05 NEAR

export async function sendNear(account: Account, receiverId: string, amount: bigint) {
  return account.transfer({ receiverId, amount });
}

/** Send a NEP-141 token; registers the receiver first if needed (0.00125 NEAR). */
export async function sendToken(account: Account, token: string, receiverId: string, amount: bigint) {
  const reg = (await read((p) => p.callFunction({ contractId: token, method: 'storage_balance_of', args: { account_id: receiverId } })).catch(() => null)) as unknown;
  if (!reg) {
    await account.callFunction({ contractId: token, methodName: 'storage_deposit', args: { account_id: receiverId, registration_only: true }, deposit: 125n * 10n ** 19n, gas: 30n * 10n ** 12n });
  }
  return account.callFunction({ contractId: token, methodName: 'ft_transfer', args: { receiver_id: receiverId, amount: amount.toString() }, deposit: 1n, gas: 30n * 10n ** 12n });
}
