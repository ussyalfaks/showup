import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KeyPair, type KeyPairString } from 'near-api-js';
import { cardLink, cardPublicKey, checkinMessage, implicitIdFor, newCardKey, newImplicitAccount, parseCardSecret, parseCheckin, signCheckin } from '../src/lib/near.ts';
import { fromUnits, toUnits } from '../src/lib/units.ts';

test('units', () => {
  assert.equal(toUnits('1.5', 24), '1500000000000000000000000');
  assert.equal(toUnits('2', 6), '2000000');
  assert.equal(fromUnits('1500000', 6), '1.5');
  assert.throws(() => toUnits('abc', 6));
});

test('new wallet is an implicit account of its own key', () => {
  const a = newImplicitAccount();
  assert.match(a.accountId, /^[0-9a-f]{64}$/);
  assert.equal(implicitIdFor(KeyPair.fromString(a.secretKey as KeyPairString).getPublicKey().toString()), a.accountId);
});

test('card link round-trips to the same public key', () => {
  const { publicKey, secret } = newCardKey();
  const link = cardLink(secret);
  assert.equal(parseCardSecret(link), secret);
  assert.equal(parseCardSecret(secret), secret);
  assert.equal(parseCardSecret('hello'), null);
  assert.equal(cardPublicKey(secret), publicKey);
});

test('check-in QR is a valid signature over the contract message', () => {
  const kp = KeyPair.fromRandom('ed25519');
  const qr = signCheckin(kp.toString(), '3', 'ada.testnet', 1_700_000_000_000);
  assert.deepEqual(parseCheckin(JSON.stringify(qr)), qr);
  const msg = new TextEncoder().encode(checkinMessage('3', 'ada.testnet', 1_700_000_000_000));
  assert.ok(kp.verify(msg, Buffer.from(qr.s, 'base64')));
  assert.equal(parseCheckin('{"t":"other"}'), null);
});

import { buildPost, eventPostText, imageUrl, isImplicit, shoutOutText } from '../src/lib/social.ts';
import { parseAddress } from '../src/lib/near.ts';

test('NEAR Social post has the near.social shape, hashtags and mentions', () => {
  const d = buildPost('host.testnet', 'Thanks @ada.testnet and @bayo.testnet! #showup #near', { showup: { event: { '3': '{}' } } });
  const acc = d['host.testnet'];
  assert.equal(JSON.parse(acc.post.main).type, 'md');
  assert.deepEqual(JSON.parse(acc.index.hashtag).map((h: any) => h.key), ['showup', 'near']);
  assert.deepEqual(JSON.parse(acc.index.notify).map((n: any) => n.key), ['ada.testnet', 'bayo.testnet']);
  assert.equal(acc.showup.event['3'], '{}');
});

test('shout-out tags named attendees only', () => {
  const hex = 'a'.repeat(64);
  const t = shoutOutText('Meetup', ['ada.testnet', hex], 3);
  assert.match(t, /2 of 3 showed up/);
  assert.match(t, /@ada\.testnet/);
  assert.ok(!t.includes(hex));
  assert.ok(isImplicit(hex));
});

test('event post text and profile images', () => {
  const t = eventPostText({ title: 'Lagos meetup', location: 'Yaba', startsAt: new Date(2026, 10, 20, 18), deposit: '1 NEAR', split: true });
  assert.match(t, /#showup/);
  assert.match(t, /RSVP with 1 NEAR/);
  assert.equal(imageUrl({ ipfs_cid: 'bafy' }), 'https://ipfs.near.social/ipfs/bafy');
  assert.equal(imageUrl(undefined), null);
});

test('send: address parsing', () => {
  assert.equal(parseAddress(' Bob.Near '), 'bob.near');
  assert.equal(parseAddress('near:alice.testnet'), 'alice.testnet');
  assert.equal(parseAddress('a'.repeat(64)), 'a'.repeat(64));
  assert.equal(parseAddress('not an address!'), null);
});

test('profile: SocialDB payload has name and IPFS photo', async () => {
  const { buildProfile } = await import('../src/lib/profile.ts');
  assert.deepEqual(buildProfile('ada.testnet', { name: '  Ada  ', imageCid: 'bafy123' }), {
    'ada.testnet': { profile: { name: 'Ada', image: { ipfs_cid: 'bafy123' } } },
  });
  assert.deepEqual(buildProfile('ada.testnet', { name: 'Ada' }), { 'ada.testnet': { profile: { name: 'Ada' } } });
});

test('import: a private key finds its accounts, or falls back to its implicit account', async () => {
  const { accountsForKey } = await import('../src/lib/profile.ts');
  const kp = KeyPair.fromRandom('ed25519');
  const real = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ account_ids: ['ada.testnet', 'ada2.testnet'] }))) as typeof fetch;
    assert.deepEqual(await accountsForKey(kp.toString()), ['ada.testnet', 'ada2.testnet']);
    globalThis.fetch = (async () => new Response(JSON.stringify({ account_ids: [] }))) as typeof fetch;
    assert.deepEqual(await accountsForKey(kp.toString()), [implicitIdFor(kp.getPublicKey().toString())]);
    globalThis.fetch = (async () => { throw new Error('offline'); }) as typeof fetch;
    assert.deepEqual(await accountsForKey(kp.toString()), [implicitIdFor(kp.getPublicKey().toString())]);
  } finally {
    globalThis.fetch = real;
  }
  assert.throws(() => KeyPair.fromString('not-a-key' as KeyPairString));
});
