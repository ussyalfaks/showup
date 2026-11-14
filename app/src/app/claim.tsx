import { useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAccount } from '@/context/account';
import { Button, C, Card, H1, Notice, P, Screen, errorText, useLoad } from '@/components/kit';
import { cardPublicKey, claimCard, parseCardSecret, view, type Card as CardT } from '@/lib/near';
import { fmt, shortId } from '@/lib/units';
import { Who } from '@/components/Who';

/** Opened from a `showup://claim?k=<secret>` link, a scanned QR, or a pasted code. */
export default function Claim() {
  const { k } = useLocalSearchParams<{ k?: string }>();
  const secret = k ? parseCardSecret(String(k)) : null;
  const { accountId, hasWallet, onboarded, createAccount, finishOnboarding, refreshBalance } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const card = useLoad(() => (secret ? view<CardT | null>('get_card', { public_key: cardPublicKey(secret) }) : Promise.resolve(null)), [secret]);

  if (!secret) return <Screen padTop={false}><Notice tone="red" text="This link doesn't contain a valid card code." /></Screen>;
  const c = card.data;

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      // Opened before onboarding: make the wallet now, so claiming stays one tap.
      const to = hasWallet && accountId ? accountId : await createAccount();
      await claimCard(secret!, to, c!.asset);
      if (!onboarded) await finishOnboarding();
      setDone(true);
      setTimeout(refreshBalance, 2500);
    } catch (e) {
      const m = (e as { message?: string })?.message ?? String(e);
      setError(
        /Exceeded the prepaid gas/i.test(m)
          ? "This card was made before an update and can't cover setting up a new wallet. Your money is safe: ask the sender to take it back (Gift Cards → Take back) and send a new card."
          : errorText(e),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padTop={false}>
      {card.error && <Notice tone="red" text={card.error} />}
      {card.data === null && !card.error && <P muted>Loading card…</P>}
      {c && (
        <Card tone={done ? 'green' : 'accent'}>
          <P muted small>A gift from</P>
          <Who account={c.creator} />
          <Text style={{ fontSize: 40, fontWeight: '900', color: C.ink }}>{fmt(c.amount, c.asset)}</Text>
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
          <Button title={hasWallet ? 'Claim to my wallet' : 'Create my wallet and claim'} onPress={claim} busy={busy} />
          <P muted small>
            {hasWallet ? `Goes to ${shortId(accountId ?? '')}. ` : 'We make a wallet on this phone for you. '}No fee, no gas — the card pays for it.
          </P>
        </>
      )}
      {error && <Notice tone="red" text={error} />}
    </Screen>
  );
}
