import { useState } from 'react';
import { Share, Text, View } from 'react-native';
import { router } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { useAccount } from '@/context/account';
import { Button, C, Card, Field, H1, H2, Notice, P, Pill, Row, Screen, confirmDestructive, errorText, useLoad } from '@/components/kit';
import { call, cardLink, parseCardSecret, view, type Card as CardT } from '@/lib/near';
import { loadCardSecrets } from '@/lib/cardstore';
import { fmt } from '@/lib/units';
import { Who } from '@/components/Who';

export default function Cards() {
  const { accountId, account, refreshBalance } = useAccount();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: 'green' | 'red' } | null>(null);

  async function takeBack(c: CardT) {
    const ok = await confirmDestructive('Take Back This Card?', `The ${fmt(c.amount, c.asset)} returns to your wallet and the link stops working.`, 'Take Back');
    if (!ok) return;
    setBusy(c.public_key);
    setMsg(null);
    try {
      await call(account(), 'cancel_card', { public_key: c.public_key }, { tgas: 100 });
      setMsg({ text: `${fmt(c.amount, c.asset)} is back in your wallet.`, tone: 'green' });
      await mine.reload();
      refreshBalance();
    } catch (e) {
      setMsg({ text: errorText(e), tone: 'red' });
    } finally {
      setBusy(null);
    }
  }
  const [open, setOpen] = useState<string | null>(null);
  const mine = useLoad(async () => {
    if (!accountId) return { cards: [] as CardT[], secrets: {} as Record<string, string> };
    const [cards, secrets] = await Promise.all([view<CardT[]>('cards_by', { account_id: accountId }), loadCardSecrets()]);
    return { cards, secrets };
  }, [accountId], 15_000);
  const secret = parseCardSecret(code);

  return (
    <Screen onRefresh={mine.reload}>
      <H1>Gift cards</H1>
      <P muted>Send NEAR or USDC as a link or QR. The person who opens it gets the money — no wallet, no gas, no app store detour.</P>
      <Button title="+ Create a gift card" onPress={() => router.push('/card/new')} />

      <H2>Got a card?</H2>
      <Card>
        <Field label="Paste the link or code" value={code} onChangeText={setCode} placeholder="showup://claim?k=…" />
        <Row>
          <Button title="Open card" disabled={!secret} onPress={() => router.push({ pathname: '/claim', params: { k: secret! } })} />
          <Button variant="secondary" title="Scan QR" onPress={() => router.push({ pathname: '/scan', params: { mode: 'claim' } })} />
        </Row>
      </Card>

      <H2>Cards you sent</H2>
      {msg && <Notice tone={msg.tone} text={msg.text} />}
      {mine.error && <Notice tone="red" text={mine.error} />}
      {mine.data && !mine.data.cards.length && <P muted>None yet.</P>}
      {mine.data?.cards.map((c) => {
        const s = mine.data!.secrets[c.public_key];
        const status = c.cancelled ? ['cancelled', 'red'] : c.claimed_by ? ['claimed', 'green'] : !c.funded ? ['waiting for USDC', 'accent'] : ['not claimed yet', 'accent'];
        return (
          <Card key={c.public_key}>
            <Row>
              <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>{fmt(c.amount, c.asset)}</Text>
              <Pill text={status[0]} tone={status[1] as 'red' | 'green' | 'accent'} />
            </Row>
            {c.message ? <P>“{c.message}”</P> : null}
            {c.claimed_by && <Who account={c.claimed_by} suffix=" claimed it" size={22} />}
            {!c.claimed_by && !c.cancelled && s && (
              <>
                <Row>
                  <Button variant="secondary" title={open === c.public_key ? 'Hide QR' : 'Show QR'} onPress={() => setOpen(open === c.public_key ? null : c.public_key)} />
                  <Button variant="secondary" title="Share link" onPress={() => Share.share({ message: `You got ${fmt(c.amount, c.asset)}! Claim it in ShowUp: ${cardLink(s)}` })} />
                </Row>
                <Button variant="ghost" title="Take back" busy={busy === c.public_key} onPress={() => takeBack(c)} />
                {open === c.public_key && (
                  <View accessible accessibilityRole="image" accessibilityLabel={`QR code for a ${fmt(c.amount, c.asset)} gift card`} style={{ alignSelf: 'center', padding: 12, backgroundColor: '#fff', borderRadius: 12 }}>
                    <QRCode value={cardLink(s)} size={200} />
                  </View>
                )}
              </>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
