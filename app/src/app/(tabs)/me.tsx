import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Image, Linking, Pressable, Text, View, useWindowDimensions } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useAccount } from '@/context/account';
import { useProfiles } from '@/components/Who';
import { Button, C, Card, F, H2, IconButton, ListRow, Notice, P, QR, Screen, Ticket, confirmDestructive, errorText, useLoad } from '@/components/kit';
import { CONTRACT_ID, FAUCET, NETWORK, USDC_ID } from '@/lib/config';
import { ftBalance, view, type Attendance } from '@/lib/near';
import { saveProfile, type ProfileInput } from '@/lib/profile';
import { clearDraft, loadDraft } from '@/lib/profileDraft';
import { imageUrl } from '@/lib/social';
import { fromUnits, shortId } from '@/lib/units';

export default function Me() {
  const { account, accountId, balance, balanceLoaded, refreshBalance, resetAccount } = useAccount();
  const narrow = useWindowDimensions().width < 375;
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

  async function copyAddress() {
    await Clipboard.setStringAsync(accountId ?? '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Screen tabBar onRefresh={async () => { await refreshBalance(); await rec.reload(); setProfileKey((k) => k + 1); }}>
      {/* Profile */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={shownName ? 'Edit profile' : 'Set up your profile'} onPress={() => router.push('/profile')}>
          <View style={{ width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: C.coral }}>
            {photo ? <Image source={{ uri: photo }} style={{ width: 60, height: 60 }} accessibilityLabel="Your profile photo" /> : <Text style={{ fontFamily: F.display, fontSize: 24, color: C.navy }}>{shownName ? shownName.slice(0, 1).toUpperCase() : '?'}</Text>}
          </View>
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} accessibilityRole="header" style={{ fontFamily: F.display, fontSize: 24, lineHeight: 28, color: C.ink }}>{shownName ?? 'Add your name'}</Text>
          <Text selectable numberOfLines={1} style={{ fontFamily: F.monoRegular, fontSize: 13, color: C.muted }}>{shortId(accountId ?? '')}</Text>
        </View>
        <Button compact title={shownName ? 'Edit' : 'Set up'} onPress={() => router.push('/profile')} />
      </View>
      {draft && (
        <Card tone="accent">
          <P small style={{ color: C.purpleInk }}>{funded ? 'Your profile is saved on this phone. Publish it so hosts and friends see it.' : 'Your profile is saved on this phone. Add NEAR to your wallet, then publish it here.'}</P>
          {funded && <Button compact variant="brand" title="Publish profile" onPress={publish} busy={busy} />}
        </Card>
      )}

      {/* Balance */}
      <View style={{ backgroundColor: C.navy, borderRadius: 26, padding: 20, gap: 16, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', right: -60, bottom: -80, width: 200, height: 200, borderRadius: 100, backgroundColor: C.accent }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: F.body, color: '#C9C6DB', fontSize: 15 }}>Balance</Text>
          {NETWORK === 'testnet' && (
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#2B2850' }}>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 12, letterSpacing: 0.8, color: '#C9C6DB' }}>TESTNET</Text>
            </View>
          )}
        </View>
        <Text style={{ fontFamily: F.display, fontSize: 46, lineHeight: 50, color: '#FFFFFF', letterSpacing: -1.5 }}>
          {funded ? fromUnits(balance!, 24) : balanceLoaded ? '0' : '…'} <Text style={{ fontSize: 22, color: C.coral }}>NEAR</Text>
        </Text>
        {usdc > 0n && <Text style={{ fontFamily: F.bodyBold, fontSize: 17, color: '#FFFFFF' }}>{fromUnits(usdc, 6)} USDC</Text>}
        {!funded && balanceLoaded && <Text style={{ fontFamily: F.body, fontSize: 14, lineHeight: 20, color: '#C9C6DB' }}>Your wallet activates the first time it receives NEAR: claim a gift card, or send some to your address.</Text>}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button compact variant="coral" title="Send" disabled={!funded} onPress={() => router.push('/send')} style={{ flex: 1 }} />
          <Button compact variant="white" title={receive ? 'Hide' : 'Receive'} onPress={() => setReceive(!receive)} style={{ flex: 1, borderWidth: 0 }} />
          {NETWORK === 'testnet' && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Faucet"
              onPress={() => Linking.openURL(FAUCET)}
              style={({ pressed }) => ({ flex: 1, minHeight: 44, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 15, color: '#FFFFFF' }}>Faucet</Text>
            </Pressable>
          )}
        </View>
      </View>
      {receive && accountId && <QR value={accountId} size={180} label={`QR code of your address, ${accountId}`} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 18, padding: 6, borderRadius: 999, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }}>
        <Text selectable numberOfLines={1} style={{ flex: 1, fontFamily: F.monoRegular, fontSize: 13, color: C.mutedInk }}>{accountId}</Text>
        <IconButton round icon={copied ? 'check' : 'copy'} label={copied ? 'Address copied' : 'Copy address'} tone="soft" onPress={copyAddress} />
      </View>

      {/* Reliability */}
      <H2>Do I show up?</H2>
      <Ticket
        borderless
        stubWidth={104}
        stub={
          <View style={{ alignItems: 'center', gap: 4 }} accessible accessibilityLabel={rate === null ? 'No reliability score yet' : `Reliability ${rate} percent`}>
            <Text style={{ fontFamily: F.display, fontSize: 28, color: rate === null ? C.muted : C.accent }}>{rate === null ? '—' : `${rate}%`}</Text>
            <Text style={{ fontFamily: F.bodyBold, fontSize: 13, color: C.muted }}>Reliability</Text>
          </View>
        }>
        {/* Side by side as in the design; stacked on narrow phones so labels never break mid-word. */}
        <View style={narrow ? { gap: 4 } : { flexDirection: 'row', gap: 6 }}>
          <MiniStat inline={narrow} value={r?.attended ?? 0} label="Showed up" />
          <MiniStat inline={narrow} value={r?.no_shows ?? 0} label="No-shows" />
          <MiniStat inline={narrow} value={r?.hosted ?? 0} label="Hosted" />
        </View>
      </Ticket>
      <Text style={{ fontFamily: F.body, fontSize: 14, lineHeight: 20, color: C.muted, paddingHorizontal: 4 }}>
        {rate !== null && done >= 3 && rate >= 80 ? 'Public and on-chain. Hosts can give you half-price deposits.' : 'Public and on-chain. Hosts can give reliable people a lower deposit.'}
      </Text>

      {/* Account */}
      <H2>Wallet</H2>
      <Card style={{ padding: 0, gap: 0 }}>
        <ListRow icon="key" title="Back up / export key" onPress={() => router.push('/backup')} right={<View accessibilityLabel="Recommended" style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.coral }} />} />
        <View style={{ height: 1, backgroundColor: C.line }} />
        <ListRow
          icon="trash-2"
          tone="red"
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
      </Card>
      {msg && <Notice tone={msg.tone} text={msg.text} />}
      <Text style={{ fontFamily: F.monoRegular, fontSize: 12, color: C.muted }}>Contract · {CONTRACT_ID}</Text>
    </Screen>
  );
}

function MiniStat({ value, label, inline }: { value: number; label: string; inline?: boolean }) {
  if (inline) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={{ fontFamily: F.display, fontSize: 20, minWidth: 22, color: C.ink }}>{value}</Text>
        <Text style={{ fontFamily: F.body, fontSize: 14, color: C.muted }}>{label}</Text>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ fontFamily: F.display, fontSize: 24, color: C.ink }}>{value}</Text>
      <Text numberOfLines={2} style={{ fontFamily: F.body, fontSize: 12, lineHeight: 15, color: C.muted }}>{label}</Text>
    </View>
  );
}

