import { useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAccount } from '@/context/account';
import { Button, C, Card, F, Field, H1, Notice, P, Screen, errorText, useLoad } from '@/components/kit';
import { cardPublicKey, claimCard, view, type Card as CardT } from '@/lib/near';
import { deriveCardKey, normalizeCode, parseCardLink } from '@/lib/cardcode';
import { fmt, shortId } from '@/lib/units';
import { Who } from '@/components/Who';

/**
 * Opened from a card link, a scanned QR, or a pasted link.
 * New cards: `showup://claim?c=<link half>&p=<public key>` plus a redeem code sent separately.
 * Older cards: `showup://claim?k=<whole key>`, no code.
 */
export default function Claim() {
  const params = useLocalSearchParams<{ k?: string; c?: string; p?: string }>();
  const link = parseCardLink(params.c && params.p ? `?c=${params.c}&p=${params.p}` : String(params.k ?? ''));
  const publicKey = link?.kind === 'coded' ? link.publicKey : link?.kind === 'key' ? cardPublicKey(link.secret) : null;
  const { accountId, hasWallet, onboarded, createAccount, finishOnboarding, refreshBalance } = useAccount();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Wrapped so "still loading" (data null) and "no such card" (card null) look different.
  // Re-checked every 5 s: a card opened seconds after it was made can lag behind on the RPC,
  // and the status (claimed, taken back) stays current while the person types the code.
  const card = useLoad(async () => ({ card: publicKey ? await view<CardT | null>('get_card', { public_key: publicKey }) : null }), [publicKey], 8000);

  if (!link || !publicKey) return <Screen back="Claim a gift card"><Notice tone="red" text="This link doesn't contain a valid gift card." /></Screen>;
  const c = card.data?.card;
  const needsCode = link.kind === 'coded';
  const codeOk = !needsCode || !!normalizeCode(code);

  async function claim() {
    setError(null);
    let to: string | null = null;
    try {
      // New cards: rebuild the key from the link half and the code, and check it really is
      // this card's key before sending anything, so a typo costs nothing.
      let secret: string;
      if (link!.kind === 'coded') {
        setBusy('Checking code…');
        const key = await deriveCardKey(link!.linkSecret, code);
        if (key.publicKey !== link!.publicKey) throw new Error("That redeem code doesn't match this card. Check it with the sender and try again.");
        secret = key.secret;
      } else {
        secret = link!.secret;
      }
      setBusy('Claiming…');
      // Opened before onboarding: make the wallet now, so claiming stays one tap.
      to = hasWallet && accountId ? accountId : await createAccount();
      await claimCard(secret, to, c!.asset);
      if (!onboarded) await finishOnboarding();
      setDone(true);
      setTimeout(refreshBalance, 2500);
    } catch (e) {
      // A claim can land even when the reply is lost: the RPC times out, the library resends,
      // and the resend fails because the card's one-time key is already gone. Trust the chain.
      const after = to ? await view<CardT | null>('get_card', { public_key: publicKey }).catch(() => null) : null;
      if (to && after?.claimed_by === to) {
        if (!onboarded) await finishOnboarding();
        setDone(true);
        setTimeout(refreshBalance, 2500);
        return;
      }
      const m = (e as { message?: string })?.message ?? String(e);
      setError(
        /Exceeded the prepaid gas/i.test(m)
          ? "This card was made before an update and can't cover setting up a new wallet. Your money is safe: ask the sender to take it back (Gift Cards → Take back) and send a new card."
          : errorText(e),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen back="Claim a gift card">
      {card.error && <Notice tone="red" text={card.error} />}
      {!card.data && !card.error && <P muted>Loading card…</P>}
      {card.data && !c && <Notice text="Looking for this gift card… If it was just created, it appears in a few seconds. If not, check the link with the sender." />}
      {c && (
        <Card tone={done ? 'green' : 'accent'}>
          <P muted small>A gift from</P>
          <Who account={c.creator} />
          <Text style={{ fontSize: 40, fontFamily: F.display, color: C.ink }}>{fmt(c.amount, c.asset)}</Text>
          {c.message ? <P>“{c.message}”</P> : null}
        </Card>
      )}
      {c && done && (
        <>
          <H1>It&apos;s yours 🎉</H1>
          <P>The money is in your ShowUp wallet. Use it to RSVP to an event, or send it on.</P>
          <Button title="Go to my wallet" onPress={() => router.replace('/me')} />
          <Button variant="secondary" title="Add your name and photo" onPress={() => router.replace('/profile')} />
        </>
      )}
      {c && !done && (c.claimed_by || c.cancelled) && <Notice tone="red" text={c.cancelled ? 'The sender took this card back.' : `Already claimed by ${shortId(c.claimed_by!)}.`} />}
      {c && !done && !c.funded && !c.cancelled && <Notice text="This card is still waiting for its USDC deposit." />}
      {c && !done && c.funded && !c.claimed_by && !c.cancelled && (
        <>
          {needsCode && (
            <Field
              label="Redeem code"
              value={code}
              onChangeText={(v) => { setCode(v); setError(null); }}
              placeholder="K7QM9-XRT4P"
              autoCapitalize="characters"
              maxLength={14}
              hint="The sender gives you this separately from the link."
            />
          )}
          <Button title={busy ?? (hasWallet ? 'Claim to my wallet' : 'Create my wallet and claim')} onPress={claim} busy={!!busy} disabled={!codeOk} />
          <P muted small>
            {hasWallet ? `Goes to ${shortId(accountId ?? '')}. ` : 'We make a wallet on this phone for you. '}No fee, no gas — the card pays for it.
          </P>
        </>
      )}
      {busy && <P muted small>{busy}</P>}
      {error && <Notice tone="red" text={error} />}
    </Screen>
  );
}
