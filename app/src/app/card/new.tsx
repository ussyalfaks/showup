import { useEffect, useState } from 'react';
import { Share, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useAccount } from '@/context/account';
import { Button, C, Card, Field, H1, Notice, P, QR, Row, Screen, Segmented, errorText } from '@/components/kit';
import { CARD_FEE, CONTRACT_ID, USDC_ID } from '@/lib/config';
import { call, cardLink, ftBalance, newCardKey } from '@/lib/near';
import { saveCardSecret } from '@/lib/cardstore';
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
  const [copied, setCopied] = useState(false);

  async function create() {
    setError(null);
    setBusy(true);
    try {
      if (balance === null) throw new Error("Your wallet isn't activated yet. Add some NEAR first: Me → Testnet faucet, or claim a gift card.");
      const units = toUnits(amount, asset === 'near' ? 24 : 6);
      if (asset === 'usdc' && usdc !== null && BigInt(units) > usdc) throw new Error(`You have ${fromUnits(usdc, 6)} USDC. Add USDC to your wallet, or make a NEAR card instead.`);
      if (balance < (asset === 'near' ? BigInt(units) : 0n) + CARD_FEE) throw new Error(`You need ${asset === 'near' ? `${amount} NEAR plus ` : ''}the ${fromUnits(CARD_FEE, 24)} NEAR fee. You have ${fromUnits(balance, 24)} NEAR.`);
      const { publicKey, secret } = newCardKey();
      const assetId = asset === 'near' ? 'near' : USDC_ID;
      const acc = account();
      await call(acc, 'create_card', { public_key: publicKey, asset: assetId, amount: units, message: message.trim() || null }, {
        deposit: asset === 'near' ? BigInt(units) + CARD_FEE : CARD_FEE,
        tgas: 50,
      });
      if (asset === 'usdc') {
        await call(acc, 'ft_transfer_call', { receiver_id: CONTRACT_ID, amount: units, msg: JSON.stringify({ fund_card: publicKey }) }, { contractId: USDC_ID, deposit: 1n, tgas: 100 });
      }
      await saveCardSecret(publicKey, secret);
      setLink(cardLink(secret));
      refreshBalance();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (link) {
    return (
      <Screen padTop={false}>
        <H1>Your card is ready</H1>
        <P muted>Anyone with this link or QR can claim {amount} {asset === 'near' ? 'NEAR' : 'USDC'} — share it only with the person it&apos;s for.</P>
        <QR value={link} size={230} label={`QR code for your ${amount} ${asset === 'near' ? 'NEAR' : 'USDC'} gift card`} />
        <Row>
          <Button title="Share" onPress={() => Share.share({ message: `You got ${amount} ${asset === 'near' ? 'NEAR' : 'USDC'}${message ? ` — “${message}”` : ''}! Claim it in ShowUp: ${link}` })} />
          <Button variant="secondary" title={copied ? 'Copied' : 'Copy link'} onPress={async () => { await Clipboard.setStringAsync(link); setCopied(true); }} />
        </Row>
        <P muted small>You can find it again under Gift cards → Cards you sent, and take the money back while it&apos;s unclaimed.</P>
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <H1>New gift card</H1>
      <Card>
        <Segmented label="Currency" value={asset} options={[{ value: 'near', label: 'NEAR' }, { value: 'usdc', label: 'USDC' }]} onChange={setAsset} />
        <Field label={`Amount (${asset === 'near' ? 'NEAR' : 'USDC'})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="5" />
        <Field label="Message (optional)" value={message} onChangeText={setMessage} placeholder="Happy birthday! 🎉" maxLength={140} />
        <Text style={{ color: C.muted, fontSize: 13 }}>
          Fee: {fromUnits(CARD_FEE, 24)} NEAR flat (pays the claimer&apos;s gas). You have {balance === null ? '0' : fromUnits(balance, 24)} NEAR{asset === 'usdc' ? ` and ${usdc === null ? '…' : fromUnits(usdc, 6)} USDC` : ''}.
        </Text>
      </Card>
      {balance === null && (
        <Card tone="accent">
          <P>Your wallet needs some NEAR before it can lock a card. It activates the first time it receives NEAR.</P>
          <Button variant="secondary" title="Add NEAR" onPress={() => router.push('/me')} />
        </Card>
      )}
      <Button title="Create card" onPress={create} busy={busy} disabled={!amount || balance === null} />
      {error && <Notice tone="red" text={error} />}
    </Screen>
  );
}
