import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Who } from '@/components/Who';
import { Linking, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useAccount } from '@/context/account';
import { Button, C, Card, Field, H1, H2, Notice, P, Row, Screen, Stat, confirmDestructive, errorText, useLoad } from '@/components/kit';
import { CONTRACT_ID, FAUCET, NETWORK, USDC_ID } from '@/lib/config';
import { ftBalance, view, type Attendance } from '@/lib/near';
import { SOCIAL_WEB, isImplicit } from '@/lib/social';
import { fromUnits, shortId } from '@/lib/units';

export default function Me() {
  const { accountId, balance, refreshBalance, importAccount, resetAccount } = useAccount();
  const rec = useLoad(() => (accountId ? view<Attendance>('get_record', { account_id: accountId }) : Promise.resolve(null)), [accountId]);
  const [copied, setCopied] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [impId, setImpId] = useState('');
  const [impKey, setImpKey] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [usdc, setUsdc] = useState<bigint>(0n);
  useEffect(() => {
    if (accountId) ftBalance(USDC_ID, accountId).then(setUsdc);
  }, [accountId, balance]);

  const r = rec.data;
  const done = r ? r.attended + r.no_shows : 0;
  const rate = r && done ? Math.round((r.attended / done) * 100) : null;

  return (
    <Screen onRefresh={async () => { await refreshBalance(); await rec.reload(); }}>
      <H1>Me</H1>

      <Card>
        <P muted small>Your account ({NETWORK})</P>
        {accountId && <Who account={accountId} size={36} />}
        <Text selectable style={{ fontFamily: 'monospace', fontSize: 12, color: C.muted }}>{accountId}</Text>
        <Text style={{ fontSize: 28, fontWeight: '800', color: C.ink }}>
          {balance === null ? 'Not activated yet' : `${fromUnits(balance, 24)} NEAR`}
        </Text>
        {usdc > 0n && <Text style={{ fontSize: 18, fontWeight: '700', color: C.ink }}>{fromUnits(usdc, 6)} USDC</Text>}
        <Row>
          <Button title="Send" disabled={balance === null} onPress={() => router.push('/send')} />
          <Button variant="secondary" title="Back up / export" onPress={() => router.push('/backup')} />
        </Row>
        {balance === null && (
          <P muted small>Your wallet lives on this phone. It activates the first time it receives NEAR — claim a gift card, or send some to the address above{NETWORK === 'testnet' ? ' (free from the testnet faucet)' : ''}.</P>
        )}
        <Row>
          <Button variant="secondary" title={copied ? 'Copied' : 'Copy address'} onPress={async () => { await Clipboard.setStringAsync(accountId ?? ''); setCopied(true); }} />
          {NETWORK === 'testnet' && <Button variant="secondary" title="Testnet faucet" onPress={() => Linking.openURL(FAUCET)} />}
        </Row>
        {accountId && (
          <View style={{ alignItems: 'center', paddingVertical: 8 }}>
            <View accessible accessibilityRole="image" accessibilityLabel={`QR code of your address, ${accountId}`}>
              <QRCode value={accountId} size={160} />
            </View>
            <P muted small>Scan to send me NEAR</P>
          </View>
        )}
      </Card>

      <H2>Do I show up?</H2>
      <Row>
        <Stat value={r?.attended ?? '–'} label="showed up" />
        <Stat value={r?.no_shows ?? '–'} label="no-shows" />
        <Stat value={rate === null ? '–' : `${rate}%`} label="reliability" />
        <Stat value={r?.hosted ?? '–'} label="hosted" />
      </Row>
      <P muted small>Public and on-chain. Hosts can give reliable people a lower deposit.</P>

      {accountId && isImplicit(accountId) && (
        <P muted small>Want your name and photo to show up for hosts and friends? Use a named account (like you.{NETWORK === 'mainnet' ? 'near' : 'testnet'}) with a NEAR Social profile — set one at {SOCIAL_WEB}.</P>
      )}
      <H2>Account</H2>
      {!showImport ? (
        <Button variant="secondary" title="Use an existing NEAR account" onPress={() => setShowImport(true)} />
      ) : (
        <Card>
          <Field label="Account ID" value={impId} onChangeText={setImpId} placeholder="you.testnet" />
          <Field label="Private key" value={impKey} onChangeText={setImpKey} placeholder="ed25519:…" secureTextEntry hint="Stored only in this phone's secure storage." />
          <Button
            title="Use this account"
            onPress={async () => {
              try {
                await importAccount(impId, impKey);
                setShowImport(false);
                setMsg(`Now using ${shortId(impId)}`);
                refreshBalance();
              } catch (e) {
                setMsg(errorText(e));
              }
            }}
          />
        </Card>
      )}
      <Button
        variant="ghost"
        title="Start over with a new wallet"
        onPress={async () => {
          const held = balance && balance > 0n ? `${fromUnits(balance, 24)} NEAR${usdc > 0n ? ` and ${fromUnits(usdc, 6)} USDC` : ''}` : null;
          const ok = await confirmDestructive(
            'Delete This Wallet?',
            `This deletes the private key for ${shortId(accountId ?? '')} from this phone. ${held ? `The ${held} in it will be lost` : 'Anything sent to it later will be lost'} unless you saved the key under Back up / export.`,
            'Delete Wallet',
          );
          if (!ok) return;
          await resetAccount();
          setMsg('New wallet created.');
        }}
      />
      {msg && <Notice text={msg} />}
      <P muted small>Contract {CONTRACT_ID}</P>
    </Screen>
  );
}
