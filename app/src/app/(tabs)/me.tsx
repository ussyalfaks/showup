import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Image, Linking, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useAccount } from '@/context/account';
import { useProfiles } from '@/components/Who';
import { Button, C, Card, H1, H2, Notice, P, QR, Row, Screen, Stat, confirmDestructive, errorText, useLoad } from '@/components/kit';
import { CONTRACT_ID, FAUCET, NETWORK, USDC_ID } from '@/lib/config';
import { ftBalance, view, type Attendance } from '@/lib/near';
import { saveProfile, type ProfileInput } from '@/lib/profile';
import { clearDraft, loadDraft } from '@/lib/profileDraft';
import { imageUrl } from '@/lib/social';
import { fromUnits, shortId } from '@/lib/units';

export default function Me() {
  const { account, accountId, balance, refreshBalance, resetAccount } = useAccount();
  const rec = useLoad(() => (accountId ? view<Attendance>('get_record', { account_id: accountId }) : Promise.resolve(null)), [accountId]);
  const [profileKey, setProfileKey] = useState(0);
  const profiles = useProfiles(accountId ? [accountId] : [], profileKey);
  const profile = accountId ? profiles[accountId] : null;
  const [draft, setDraft] = useState<ProfileInput | null>(null);
  const [copied, setCopied] = useState(false);
  const [receive, setReceive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'green' | 'red' } | null>(null);
  const [usdc, setUsdc] = useState<bigint>(0n);
  useEffect(() => {
    if (accountId) ftBalance(USDC_ID, accountId).then(setUsdc);
  }, [accountId, balance]);
  // Back from Edit profile: re-read the draft and the published profile.
  useFocusEffect(
    useCallback(() => {
      loadDraft().then(setDraft);
      setProfileKey((k) => k + 1);
    }, []),
  );

  const r = rec.data;
  const done = r ? r.attended + r.no_shows : 0;
  const rate = r && done ? Math.round((r.attended / done) * 100) : null;
  const funded = balance !== null;
  const shownName = draft?.name || profile?.name || null;
  const photo = imageUrl(draft?.imageCid ? { ipfs_cid: draft.imageCid } : profile?.image);

  async function publish() {
    if (!draft || !accountId) return;
    setBusy(true);
    setMsg(null);
    try {
      await saveProfile(account(), accountId, draft);
      await clearDraft();
      setDraft(null);
      setProfileKey((k) => k + 1);
      setMsg({ text: 'Profile published. Hosts and friends now see your name and photo.', tone: 'green' });
      refreshBalance();
    } catch (e) {
      setMsg({ text: errorText(e), tone: 'red' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen onRefresh={async () => { await refreshBalance(); await rec.reload(); setProfileKey((k) => k + 1); }}>
      <H1>Me</H1>

      {/* Profile */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: C.accentSoft, borderWidth: 2, borderColor: C.accent, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {photo ? <Image source={{ uri: photo }} style={{ width: 72, height: 72 }} accessibilityLabel="Your profile photo" /> : <Text style={{ fontSize: 30, fontWeight: '800', color: C.accentInk }}>{(shownName ?? '?').slice(0, 1).toUpperCase()}</Text>}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: C.ink }} numberOfLines={1}>{shownName ?? 'Add your name'}</Text>
          <Text selectable style={{ fontFamily: 'monospace', fontSize: 13, color: C.muted }}>{shortId(accountId ?? '')} · {NETWORK}</Text>
        </View>
        <Button variant="secondary" title={shownName ? 'Edit' : 'Set up'} onPress={() => router.push('/profile')} />
      </View>
      {draft && (
        <Card tone="green">
          <P small>{funded ? 'Your profile is saved on this phone. Publish it so hosts and friends see it.' : "Your profile is saved on this phone. Add NEAR to your wallet, then publish it here."}</P>
          {funded && <Button title="Publish profile" onPress={publish} busy={busy} />}
        </Card>
      )}

      {/* Wallet */}
      <Card>
        <P muted small>Balance</P>
        <Text style={{ fontSize: 40, fontWeight: '800', color: C.ink, letterSpacing: -1 }}>
          {funded ? `${fromUnits(balance!, 24)} ` : 'Not active yet'}
          {funded && <Text style={{ fontSize: 22, color: C.accentInk }}>NEAR</Text>}
        </Text>
        {usdc > 0n && <Text style={{ fontSize: 18, fontWeight: '700', color: C.ink }}>{fromUnits(usdc, 6)} USDC</Text>}
        {!funded && <P muted small>Your wallet lives on this phone. It activates the first time it receives NEAR: claim a gift card, or send some to your address.</P>}
        <Row>
          <View style={{ flex: 1 }}><Button title="Send" disabled={!funded} onPress={() => router.push('/send')} /></View>
          <View style={{ flex: 1 }}><Button variant="secondary" title={receive ? 'Hide' : 'Receive'} onPress={() => setReceive(!receive)} /></View>
        </Row>
        {(receive || !funded) && accountId && (
          <View style={{ gap: 10, paddingTop: 4 }}>
            <QR value={accountId} size={170} label={`QR code of your address, ${accountId}`} />
            <Text selectable style={{ fontFamily: 'monospace', fontSize: 12, color: C.muted, textAlign: 'center' }}>{accountId}</Text>
            <Row>
              <View style={{ flex: 1 }}><Button variant="secondary" title={copied ? 'Copied' : 'Copy address'} onPress={async () => { await Clipboard.setStringAsync(accountId); setCopied(true); }} /></View>
              {NETWORK === 'testnet' && <View style={{ flex: 1 }}><Button variant="secondary" title="Testnet faucet" onPress={() => Linking.openURL(FAUCET)} /></View>}
            </Row>
          </View>
        )}
      </Card>

      {/* Reliability */}
      <H2>Do I show up?</H2>
      <Row>
        <Stat value={rate === null ? '–' : `${rate}%`} label="reliability" />
        <Stat value={r?.attended ?? '–'} label="showed up" />
        <Stat value={r?.no_shows ?? '–'} label="no-shows" />
        <Stat value={r?.hosted ?? '–'} label="hosted" />
      </Row>
      <P muted small>Public and on-chain. Hosts can give reliable people a lower deposit.</P>

      {/* Account */}
      <H2>Wallet</H2>
      <Button variant="secondary" title="Back up / export key" onPress={() => router.push('/backup')} />
      <Button
        variant="ghost"
        title="Remove wallet from this phone"
        onPress={async () => {
          const held = balance && balance > 0n ? `${fromUnits(balance, 24)} NEAR${usdc > 0n ? ` and ${fromUnits(usdc, 6)} USDC` : ''}` : null;
          const ok = await confirmDestructive(
            'Remove This Wallet?',
            `This deletes the private key for ${shortId(accountId ?? '')} from this phone. ${held ? `The ${held} in it will be lost` : 'Anything sent to it later will be lost'} unless you saved the key under Back up / export. You can then create or import another wallet.`,
            'Remove Wallet',
          );
          if (ok) await resetAccount();
        }}
      />
      {msg && <Notice tone={msg.tone} text={msg.text} />}
      <P muted small>Contract {CONTRACT_ID}</P>
    </Screen>
  );
}
