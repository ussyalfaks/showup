import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useAccount } from '@/context/account';
import { Button, C, Card, Chips, F, Field, H1, Icon, Logo, Notice, P, QR, Screen, SectionLabel, Segmented, errorText } from '@/components/kit';
import { CARD_FEE, CONTRACT_ID, USDC_ID } from '@/lib/config';
import { call, ftBalance } from '@/lib/near';
import { saveProtectedCard } from '@/lib/cardstore';
import { newProtectedCard } from '@/lib/cardcode';
import { linkBase, shareOrCopy } from '@/lib/links';
import { RedeemCode } from '@/components/RedeemCode';
import { fromUnits, toUnits } from '@/lib/units';

export default function NewCard() {
  const { account, accountId, balance, refreshBalance } = useAccount();
  const [usdc, setUsdc] = useState<bigint | null>(null);
  useEffect(() => {
    if (accountId) ftBalance(USDC_ID, accountId).then(setUsdc).catch(() => setUsdc(0n));
  }, [accountId, balance]);
  const [asset, setAsset] = useState<'near' | 'usdc'>('near');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  async function create() {
    setError(null);
    setBusy(true);
    try {
      if (balance === null) throw new Error("Your wallet isn't activated yet. Add some NEAR first: Me → Testnet faucet, or claim a gift card.");
      const units = toUnits(amount, asset === 'near' ? 24 : 6);
      if (asset === 'usdc' && usdc !== null && BigInt(units) > usdc) throw new Error(`You have ${fromUnits(usdc, 6)} USDC. Add USDC to your wallet, or make a NEAR card instead.`);
      if (balance < (asset === 'near' ? BigInt(units) : 0n) + CARD_FEE) throw new Error(`You need ${asset === 'near' ? `${amount} NEAR plus ` : ''}the ${fromUnits(CARD_FEE, 24)} NEAR fee. You have ${fromUnits(balance, 24)} NEAR.`);
      // Every card gets a redeem code: the key is split between the link and the code.
      const card = await newProtectedCard(linkBase());
      const { publicKey } = card;
      // Saved first, so the code is never lost even if the app closes mid-way.
      await saveProtectedCard(publicKey, card.linkSecret, card.code);
      const assetId = asset === 'near' ? 'near' : USDC_ID;
      const acc = account();
      await call(acc, 'create_card', { public_key: publicKey, asset: assetId, amount: units, message: message.trim() || null }, {
        deposit: asset === 'near' ? BigInt(units) + CARD_FEE : CARD_FEE,
        tgas: 50,
      });
      if (asset === 'usdc') {
        await call(acc, 'ft_transfer_call', { receiver_id: CONTRACT_ID, amount: units, msg: JSON.stringify({ fund_card: publicKey }) }, { contractId: USDC_ID, deposit: 1n, tgas: 100 });
      }
      setLink(card.link);
      setCode(card.code);
      refreshBalance();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const sym = asset === 'near' ? 'NEAR' : 'USDC';
  if (link && code) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: C.accent }} contentContainerStyle={{ flexGrow: 1 }}>
        <StatusBar style="light" />
        {/* Purple stage with the card */}
        <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 36, gap: 22, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: -70, top: 150, width: 140, height: 180, borderRadius: 90, backgroundColor: C.coral }} />
          <View style={{ position: 'absolute', right: -30, top: 40, width: 110, height: 110, borderRadius: 55, borderWidth: 3, borderColor: 'rgba(255,255,255,0.45)' }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.replace('/cards')} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
              <Icon name="x" size={20} color={C.ink} />
            </Pressable>
            <Text style={{ fontFamily: F.bodyBold, fontSize: 15, color: '#FFFFFF' }}>New gift card</Text>
            <View style={{ width: 44 }} />
          </View>
          <View style={{ alignSelf: 'center', width: '88%', maxWidth: 340, backgroundColor: '#FFFFFF', borderRadius: 26, padding: 18, gap: 14, shadowColor: '#1B0A6B', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Logo height={20} />
              <Text style={{ fontFamily: F.display, fontSize: 28, color: C.ink }}>
                {amount} <Text style={{ fontSize: 15, color: C.accent }}>{sym}</Text>
              </Text>
            </View>
            <QR value={link} size={180} label={`QR code for your ${amount} ${sym} gift card`} />
            {message ? <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: C.ink, textAlign: 'center' }}>“{message}”</Text> : null}
          </View>
        </View>
        {/* Sheet */}
        <View style={{ flexGrow: 1, backgroundColor: '#FFFFFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 22, paddingBottom: insets.bottom + 28, gap: 16 }}>
          <H1>Your card is ready</H1>
          <Text style={{ fontFamily: F.body, fontSize: 15, lineHeight: 22, color: C.muted }}>
            They need the link (or QR) and the redeem code to claim the {amount} {sym}. Send them in two separate messages, only to the person it&apos;s for.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              title="Share"
              icon="share"
              style={{ flex: 1 }}
              onPress={async () => {
                const r = await shareOrCopy(`You got ${amount} ${sym}${message ? ` — “${message}”` : ''}! Claim it in ShowUp: ${link}\nI'll send you the redeem code separately.`);
                if (r === 'copied') setShared('Link copied. Paste it into a message, and send the redeem code separately.');
              }}
            />
            <Button variant="secondary" title={copied ? 'Copied' : 'Copy link'} icon={copied ? 'check' : 'copy'} style={{ flex: 1 }} onPress={async () => { await Clipboard.setStringAsync(link); setCopied(true); }} />
          </View>
          {shared && <Notice tone="green" icon="check" text={shared} />}
          <RedeemCode code={code} />
          <Text style={{ fontFamily: F.body, color: C.muted, fontSize: 14, lineHeight: 20 }}>
            You can take the money back from{' '}
            <Text accessibilityRole="link" onPress={() => router.replace('/cards')} style={{ color: C.accent, textDecorationLine: 'underline' }}>Cards you sent</Text> while it&apos;s unclaimed.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <Screen back="New gift card">
      <H1>Send a gift card</H1>
      <P muted>Pick an amount and add a note. You get a link and a redeem code to send.</P>
      <Card>
        <SectionLabel n="01">Amount</SectionLabel>
        <Segmented soft label="Currency" value={asset} options={[{ value: 'near', label: 'NEAR' }, { value: 'usdc', label: 'USDC' }]} onChange={setAsset} />
        <Field value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="5" suffix={sym} accessibilityLabel={`Amount in ${sym}`} style={{ fontFamily: F.display, fontSize: 22 }} />
        <Chips label="Quick amounts" options={['1', '5', '10', '25'].map((v) => ({ value: v, label: `${v} ${sym}` }))} value={amount} onPick={setAmount} />
      </Card>
      <Card>
        <SectionLabel n="02">Note</SectionLabel>
        <Field value={message} onChangeText={setMessage} placeholder="Happy birthday! 🎉" maxLength={140} accessibilityLabel="Message (optional)" hint="Optional. The person sees it when they open the card." />
      </Card>
      <Text style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}>
        Fee {fromUnits(CARD_FEE, 24)} NEAR flat (pays the claimer&apos;s gas). You have {balance === null ? '0' : fromUnits(balance, 24)} NEAR{asset === 'usdc' ? ` and ${usdc === null ? '…' : fromUnits(usdc, 6)} USDC` : ''}.
      </Text>
      {balance === null && (
        <Card tone="amber">
          <P small>Your wallet needs some NEAR before it can lock a card. It activates the first time it receives NEAR.</P>
          <Button compact variant="secondary" title="Add NEAR" onPress={() => router.push('/me')} />
        </Card>
      )}
      <Button title="Create card" icon="gift" onPress={create} busy={busy} disabled={!amount || balance === null} />
      {error && <Notice tone="red" text={error} />}
    </Screen>
  );
}
