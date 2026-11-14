// Redeem codes for gift cards: the card's key is split in two.
//
//   link  = showup://claim?c=<linkSecret>&p=<card public key>
//   code  = 10 characters, e.g. K7QM9-XRT4P, sent separately
//   key   = ed25519 from PBKDF2-SHA256(code, salt = "showup-card-v2:" + linkSecret, 100k rounds)
//
// The contract is unchanged: it only ever sees the derived public key. Someone with the link
// but not the code can't claim. On a public chain anything stored is readable, so the code
// can always be tested offline; what protects it is its length (50 bits, generated, never
// chosen by people) times the slow derivation: ~10^15 tries of 100k rounds each.
import { ed25519 } from '@noble/curves/ed25519.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base58 } from '@scure/base';

/** Crockford base32: no I, L, O, U, so codes read aloud without ambiguity. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 10;
const ROUNDS = 100_000;
const SALT_PREFIX = 'showup-card-v2:';
const LINK_PREFIX = 'showup://claim?';

const random = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** A fresh 10-character code (50 bits). 256 is a multiple of 32, so `& 31` stays uniform. */
export function generateCode(): string {
  return Array.from(random(CODE_LENGTH), (b) => ALPHABET[b & 31]).join('');
}

/** "K7QM9XRT4P" -> "K7QM9-XRT4P" */
export const formatCode = (code: string) => `${code.slice(0, 5)}-${code.slice(5)}`;

/** Forgiving input: any case, spaces or dashes, and the look-alikes O->0, I/L->1, U->V. */
export function normalizeCode(input: string): string | null {
  const c = input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V');
  return c.length === CODE_LENGTH && [...c].every((ch) => ALPHABET.includes(ch)) ? c : null;
}

export interface CardKey {
  /** base58 of seed||public key, without the "ed25519:" prefix (what claimCard expects) */
  secret: string;
  /** "ed25519:..." */
  publicKey: string;
}

/** Rebuild the card key from the link half and the code. Deliberately slow (~0.1 s desktop, ~1 s phone). */
export async function deriveCardKey(linkSecret: string, code: string): Promise<CardKey> {
  const norm = normalizeCode(code);
  if (!norm) throw new Error(`A redeem code has ${CODE_LENGTH} letters and numbers, like K7QM9-XRT4P`);
  const seed = await pbkdf2Async(sha256, norm, SALT_PREFIX + linkSecret, { c: ROUNDS, dkLen: 32 });
  const pub = ed25519.getPublicKey(seed);
  const full = new Uint8Array(64);
  full.set(seed, 0);
  full.set(pub, 32);
  return { secret: base58.encode(full), publicKey: `ed25519:${base58.encode(pub)}` };
}

export interface ProtectedCard extends CardKey {
  linkSecret: string;
  code: string;
  link: string;
}

/** Everything needed to create a protected card: the link half, the code and the derived key. */
export async function newProtectedCard(): Promise<ProtectedCard> {
  const linkSecret = base58.encode(random(32));
  const code = generateCode();
  const key = await deriveCardKey(linkSecret, code);
  return { ...key, linkSecret, code, link: protectedCardLink(linkSecret, key.publicKey) };
}

export const protectedCardLink = (linkSecret: string, publicKey: string) =>
  `${LINK_PREFIX}c=${linkSecret}&p=${publicKey.replace(/^ed25519:/, '')}`;

export type ParsedCardLink =
  | { kind: 'key'; secret: string } // older cards: the link is the whole key
  | { kind: 'coded'; linkSecret: string; publicKey: string }; // needs a redeem code

const B58 = '[1-9A-HJ-NP-Za-km-z]';

/** Accepts a full link, the query part, or a bare old-style secret. */
export function parseCardLink(input: string): ParsedCardLink | null {
  const t = input.trim();
  const c = t.match(new RegExp(`[?&#]c=(${B58}{30,60})`));
  const p = t.match(new RegExp(`[?&#]p=(${B58}{30,60})`));
  if (c && p) return { kind: 'coded', linkSecret: c[1], publicKey: `ed25519:${p[1]}` };
  const k = t.match(new RegExp(`[?&#]k=(${B58}+)`));
  const s = k ? k[1] : t.replace(/^ed25519:/, '');
  return new RegExp(`^${B58}{60,100}$`).test(s) ? { kind: 'key', secret: s } : null;
}

/** Route params for /claim from a parsed link. */
export const claimParams = (l: ParsedCardLink) => (l.kind === 'key' ? { k: l.secret } : { c: l.linkSecret, p: l.publicKey.replace(/^ed25519:/, '') });
