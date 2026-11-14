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

test('redeem code: generated codes are 10 unambiguous characters', async () => {
  const { generateCode, normalizeCode, formatCode, CODE_LENGTH } = await import('../src/lib/cardcode.ts');
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const c = generateCode();
    assert.equal(c.length, CODE_LENGTH);
    assert.match(c, /^[0-9A-HJKMNP-TV-Z]+$/); // no I, L, O, U
    assert.equal(normalizeCode(formatCode(c).toLowerCase()), c);
    seen.add(c);
  }
  assert.equal(seen.size, 200);
  assert.equal(normalizeCode('k7qmo-xrtip'), 'K7QM0XRT1P'); // O->0, I->1
  assert.equal(normalizeCode('K7QM9'), null);
  assert.equal(normalizeCode('K7QM9-XRT4P!'), 'K7QM9XRT4P');
});

test('redeem code: the link half plus the code rebuild the card key, and nothing else does', async () => {
  const { newProtectedCard, deriveCardKey, parseCardLink, claimParams, formatCode } = await import('../src/lib/cardcode.ts');
  const card = await newProtectedCard();
  // near-api-js accepts the derived key and agrees on its public key
  assert.equal(KeyPair.fromString(`ed25519:${card.secret}` as KeyPairString).getPublicKey().toString(), card.publicKey);
  assert.equal(cardPublicKey(card.secret), card.publicKey);
  // same code, typed loosely -> same key; a different code -> a different key
  assert.equal((await deriveCardKey(card.linkSecret, ` ${formatCode(card.code).toLowerCase()} `)).publicKey, card.publicKey);
  const other = card.code[0] === 'A' ? 'B' + card.code.slice(1) : 'A' + card.code.slice(1);
  assert.notEqual((await deriveCardKey(card.linkSecret, other)).publicKey, card.publicKey);
  await assert.rejects(deriveCardKey(card.linkSecret, '123'));
  // the link carries the public key but not enough to claim
  const parsed = parseCardLink(card.link);
  assert.deepEqual(parsed, { kind: 'coded', linkSecret: card.linkSecret, publicKey: card.publicKey });
  assert.ok(!card.link.includes(card.code) && !card.link.includes(card.secret));
  assert.deepEqual(claimParams(parsed!), { c: card.linkSecret, p: card.publicKey.replace('ed25519:', '') });
});

test('redeem code: older links without a code still open', async () => {
  const { parseCardLink, claimParams } = await import('../src/lib/cardcode.ts');
  const { secret } = newCardKey();
  for (const input of [cardLink(secret), secret, `ed25519:${secret}`]) {
    assert.deepEqual(parseCardLink(input), { kind: 'key', secret });
  }
  assert.deepEqual(claimParams({ kind: 'key', secret }), { k: secret });
  assert.equal(parseCardLink('hello'), null);
});

test('event start time: 12-hour clock, date and time changes, and the 10-minute rule', async () => {
  const t = await import('../src/lib/eventTime.ts');
  // 12 AM is midnight, 12 PM is noon
  assert.deepEqual(t.to12h(0), { hour: 12, pm: false });
  assert.deepEqual(t.to12h(12), { hour: 12, pm: true });
  assert.deepEqual(t.to12h(19), { hour: 7, pm: true });
  assert.equal(t.from12h(12, false), 0);
  assert.equal(t.from12h(12, true), 12);
  assert.equal(t.from12h(7, true), 19);
  for (let h = 0; h < 24; h++) assert.equal(t.from12h(t.to12h(h).hour, t.to12h(h).pm), h);

  // changing the time keeps the day; changing the day keeps the time
  const d = new Date(2026, 10, 20, 18, 0);
  const moved = t.withTime(d, 7, 45, false);
  assert.equal(moved.getDate(), 20);
  assert.equal(moved.getHours(), 7);
  assert.equal(moved.getMinutes(), 45);
  const otherDay = t.withDay(moved, new Date(2026, 11, 1));
  assert.deepEqual([otherDay.getMonth(), otherDay.getDate(), otherDay.getHours(), otherDay.getMinutes()], [11, 1, 7, 45]);

  const now = new Date(2026, 10, 14, 18, 55);
  assert.match(t.startProblem(new Date(now.getTime() + 5 * 60_000), now)!, /10 minutes/);
  assert.equal(t.startProblem(new Date(now.getTime() + 11 * 60_000), now), null);

  // check-in summary, including a window that crosses midnight
  assert.equal(t.checkinSummary(new Date(2026, 10, 20, 18, 0), 90), 'Check-in opens 4:00 PM and closes 7:30 PM.');
  assert.match(t.checkinSummary(new Date(2026, 10, 20, 23, 30), 60), /closes 12:30 AM \(Sat\)/);
});

test('event end time: must be after the start, shown as a range', async () => {
  const t = await import('../src/lib/eventTime.ts');
  const start = new Date(2026, 10, 20, 18);
  assert.equal(t.endProblem(start, new Date(2026, 10, 20, 21)), null);
  assert.ok(t.endProblem(start, start));
  assert.ok(t.endProblem(start, new Date(2026, 10, 20, 17)));
  assert.equal(t.fmtRange(start, new Date(2026, 10, 20, 21)), '6:00 PM – 9:00 PM');
  assert.equal(t.fmtRange(start, new Date(2026, 10, 21, 1)), '6:00 PM – Sat 1:00 AM');
  assert.equal(t.fmtRange(start, null), '6:00 PM');
  const post = eventPostText({ title: 'x', location: '', startsAt: start, endsAt: new Date(2026, 10, 20, 21), deposit: '1 NEAR', split: false });
  assert.match(post, /–/);
});

test('reads fall back to the backup RPC on rate limits, but not on real answers', async () => {
  const { view, nearBalance, resetReadCooldown } = await import('../src/lib/near.ts');
  const { RPC_URL, RPC_BACKUP_URL } = await import('../src/lib/config.ts');
  const real = globalThis.fetch;
  const hits: string[] = [];
  const ok = (result: unknown) => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { status: 200 });
  try {
    // main RPC rate-limits, backup answers
    globalThis.fetch = (async (url: string) => {
      hits.push(url);
      if (url === RPC_URL) return new Response('{"jsonrpc":"2.0","error":{"code":-429,"message":"Rate limits exceeded"}}', { status: 429 });
      const bytes = [...new TextEncoder().encode(JSON.stringify(['from backup']))];
      return ok({ result: bytes, logs: [], block_height: 1, block_hash: '11111111111111111111111111111111' });
    }) as typeof fetch;
    assert.deepEqual(await view('list_events'), ['from backup']);
    assert.ok(hits.includes(RPC_URL) && hits.includes(RPC_BACKUP_URL));

    // after a refusal, reads skip the main RPC for a while
    hits.length = 0;
    assert.deepEqual(await view('list_events'), ['from backup']);
    assert.deepEqual(hits, [RPC_BACKUP_URL]);
    resetReadCooldown();

    // a real answer ("account doesn't exist") is not retried on the backup, and means not activated
    hits.length = 0;
    globalThis.fetch = (async (url: string) => {
      hits.push(url);
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { name: 'HANDLER_ERROR', cause: { name: 'UNKNOWN_ACCOUNT', info: {} }, code: -32000, message: 'Server error', data: 'account abc does not exist while viewing' } }), { status: 200 });
    }) as typeof fetch;
    assert.equal(await nearBalance('abc.testnet'), null);
    assert.ok(!hits.includes(RPC_BACKUP_URL));

    // both RPCs down: the balance check throws instead of pretending the wallet is empty
    globalThis.fetch = (async () => new Response('busy', { status: 429 })) as typeof fetch;
    await assert.rejects(nearBalance('abc.testnet'));
  } finally {
    globalThis.fetch = real;
  }
});

test('transactions: the same call is repeated on the backup RPC only for network trouble', async () => {
  const { provider, resetReadCooldown } = await import('../src/lib/near.ts');
  const { RPC_URL, RPC_BACKUP_URL } = await import('../src/lib/config.ts');
  const real = globalThis.fetch;
  const hits: string[] = [];
  const status = { chain_id: 'testnet', sync_info: { latest_block_height: 1 }, version: { version: '1', build: 'x' }, validators: [] };
  try {
    resetReadCooldown();
    globalThis.fetch = (async (url: string) => {
      hits.push(url);
      if (url === RPC_URL) return new Response('{"error":"Rate limits exceeded"}', { status: 429 });
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: status }), { status: 200 });
    }) as typeof fetch;
    const s = (await provider.viewNodeStatus()) as unknown as { chain_id: string };
    assert.equal(s.chain_id, 'testnet');
    assert.ok(hits.includes(RPC_URL) && hits.includes(RPC_BACKUP_URL));

    // a real error answer is passed on; the backup is not contacted
    resetReadCooldown();
    hits.length = 0;
    globalThis.fetch = (async (url: string) => {
      hits.push(url);
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { name: 'REQUEST_VALIDATION_ERROR', cause: { name: 'PARSE_ERROR', info: {} }, code: -32700, message: 'Parse error', data: 'bad request' } }), { status: 200 });
    }) as typeof fetch;
    await assert.rejects(provider.viewNodeStatus());
    assert.ok(!hits.includes(RPC_BACKUP_URL));
  } finally {
    globalThis.fetch = real;
    resetReadCooldown();
  }
});

test('card links work as website links too', async () => {
  const { newProtectedCard, protectedCardLink, parseCardLink } = await import('../src/lib/cardcode.ts');
  const card = await newProtectedCard('https://showup.vercel.app');
  assert.match(card.link, /^https:\/\/showup\.vercel\.app\/claim\?c=[1-9A-HJ-NP-Za-km-z]+&p=[1-9A-HJ-NP-Za-km-z]+$/);
  assert.deepEqual(parseCardLink(card.link), { kind: 'coded', linkSecret: card.linkSecret, publicKey: card.publicKey });
  assert.ok(!card.link.includes(card.code));
  // trailing slash on the site, and the app scheme
  assert.equal(protectedCardLink('abc', 'ed25519:XYZ', 'https://x.app/'), 'https://x.app/claim?c=abc&p=XYZ');
  assert.equal(protectedCardLink('abc', 'ed25519:XYZ'), 'showup://claim?c=abc&p=XYZ');
  // older whole-key links in website form still open
  const { secret } = newCardKey();
  assert.deepEqual(parseCardLink(`https://showup.vercel.app/claim?k=${secret}`), { kind: 'key', secret });
});
