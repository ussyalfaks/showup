import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAccount } from '@/context/account';
import { Button, C, Card, F, Field, H1, Notice, P, Row, Screen, Segmented, errorText } from '@/components/kit';
import { Who } from '@/components/Who';
import { EXPLORER, USDC_ID } from '@/lib/config';
import { NEAR_RESERVE, ftBalance, nearBalance, parseAddress, sendNear, sendToken } from '@/lib/near';
import { fromUnits, toUnits } from '@/lib/units';

export default function Send() {
  const params = useLocalSearchParams<{ to?: string }>();
  const { accountId, balance, account, refreshBalance } = useAccount();
  const [asset, setAsset] = useState<'near' | 'usdc'>('near');
  const [to, setTo] = useState(params.to ?? '');
  const [amount, setAmount] = useState('');
  const [usdc, setUsdc] = useState<bigint>(0n);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ amount: string; to: string; tx?: string } | null>(null);

  useEffect(() => {
    if (params.to) setTo(params.to);
  }, [params.to]);
  useEffect(() => {
    if (accountId) ftBalance(USDC_ID, accountId).then(setUsdc);
  }, [accountId]);

  const decimals = asset === 'near' ? 24 : 6;
  const available = asset === 'near' ? (balance ?? 0n) > NEAR_RESERVE ? (balance ?? 0n) - NEAR_RESERVE : 0n : usdc;
  const recipient = parseAddress(to);

  async function send() {
    setError(null);
    setBusy(true);
    try {
      if (!recipient) throw new Error('Enter a valid NEAR address (like friend.near or a 64-character address)');
      if (recipient === accountId) throw new Error("That's your own address");
      const units = BigInt(toUnits(amount, decimals));
      if (units <= 0n) throw new Error('Enter an amount');
      if (units > available) throw new Error(`You can send up to ${fromUnits(available, decimals)} ${asset === 'near' ? 'NEAR' : 'USDC'}`);
      if (!/^[0-9a-f]{64}$/.test(recipient) && (await nearBalance(recipient)) === null) throw new Error(`${recipient} doesn't exist on NEAR. Check the address.`);
      const acc = account();
      const res = asset === 'near' ? await sendNear(acc, recipient, units) : await sendToken(acc, USDC_ID, recipient, units);
      const tx = (res as { transaction?: { hash?: string } })?.transaction?.hash;
      setSent({ amount: `${amount} ${asset === 'near' ? 'NEAR' : 'USDC'}`, to: recipient, tx });
      refreshBalance();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Screen back="Send">
        <H1>Sent ✓</H1>
        <Card tone="green">
          <Text style={{ fontSize: 28, fontFamily: F.display, color: C.ink }}>{sent.amount}</Text>
          <Who account={sent.to} />
        </Card>
        {sent.tx && <P muted small>Transaction: {EXPLORER}/txns/{sent.tx}</P>}
        <Button title="Done" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen back="Send">
      <H1>Send</H1>
      <Card>
        <Segmented label="Currency" value={asset} options={[{ value: 'near', label: 'NEAR' }, { value: 'usdc', label: 'USDC' }]} onChange={setAsset} />
        <Field label="To" value={to} onChangeText={setTo} placeholder="friend.near or wallet address" />
        {recipient && <Who account={recipient} />}
        <Button variant="secondary" title="Scan their QR" onPress={() => router.push({ pathname: '/scan', params: { mode: 'address' } })} />
        <Field label={`Amount (${asset === 'near' ? 'NEAR' : 'USDC'})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
        <Row>
          <P muted small>Available: {fromUnits(available, decimals)} {asset === 'near' ? 'NEAR' : 'USDC'}</P>
          <Button variant="ghost" title="Max" onPress={() => setAmount(fromUnits(available, decimals, decimals))} />
        </Row>
        {asset === 'near' && <P muted small>0.05 NEAR always stays behind for fees.</P>}
      </Card>
      <Button title="Send" onPress={send} busy={busy} disabled={!to || !amount} />
      {error && <Notice tone="red" text={error} />}
    </Screen>
  );
}
