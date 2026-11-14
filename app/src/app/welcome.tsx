import { useState } from 'react';
import { Image, Linking, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAccount } from '@/context/account';
import { Button, C, Card, Chips, Field, Link, Notice, P, QR, Screen, errorText } from '@/components/kit';
import { ProfileEditor } from '@/components/ProfileEditor';
import { FAUCET, NETWORK } from '@/lib/config';
import { nearBalance } from '@/lib/near';
import { accountsForKey, saveProfile } from '@/lib/profile';
import { clearDraft, saveDraft } from '@/lib/profileDraft';
import { getProfiles } from '@/lib/social';
import { parseCardSecret } from '@/lib/near';
import { shortId } from '@/lib/units';

type Step = 'intro' | 'import' | 'profile' | 'fund';

/** First launch: create or import a wallet, set a name and photo, then add NEAR. */
export default function Welcome() {
  const { createAccount, importAccount, account, accountId, refreshBalance, finishOnboarding } = useAccount();
  const [step, setStep] = useState<Step>('intro');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // import
  const [key, setKey] = useState('');
  const [choices, setChoices] = useState<string[] | null>(null);
  // profile
  const [name, setName] = useState('');
  const [imageCid, setImageCid] = useState<string | null>(null);
  const [funded, setFunded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState('');

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await createAccount();
      setFunded(false);
      setStep('profile');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function useAccountId(id: string) {
    await importAccount(id, key.trim().startsWith('ed25519:') ? key.trim() : `ed25519:${key.trim()}`);
    const [bal, prof] = await Promise.all([nearBalance(id), getProfiles([id])]);
    setFunded(bal !== null);
    if (prof[id]?.name) setName(prof[id]!.name!);
    if (prof[id]?.image?.ipfs_cid) setImageCid(prof[id]!.image!.ipfs_cid!);
    refreshBalance();
    setStep('profile');
  }

  async function findAccount() {
    setBusy(true);
    setError(null);
    try {
      const k = key.trim().startsWith('ed25519:') ? key.trim() : `ed25519:${key.trim()}`;
      const ids = await accountsForKey(k);
      if (ids.length === 1) await useAccountId(ids[0]);
      else setChoices(ids);
    } catch (e) {
      setError(/invalid|base58|length|unknown/i.test(errorText(e)) ? "That doesn't look like a NEAR private key. It starts with ed25519:" : errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveAndContinue() {
    setBusy(true);
    setError(null);
    try {
      const input = { name: name.trim(), imageCid };
      if (input.name) {
        // A new wallet has no NEAR yet, so keep the profile and publish it from Me once funded.
        if (funded) await saveProfile(account(), accountId!, input).then(clearDraft);
        else await saveDraft(input);
      }
      if (funded) await done();
      else setStep('fund');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function done() {
    await finishOnboarding(); // the root layout then opens the app
    refreshBalance();
  }

  return (
    <Screen>
      {step === 'intro' && <Intro busy={busy} onCreate={create} onImport={() => setStep('import')} />}

      {step === 'import' && (
        <>
          <Back onPress={() => { setStep('intro'); setChoices(null); setError(null); }} />
          <Text style={{ fontSize: 30, fontWeight: '800', color: C.ink, letterSpacing: -0.6 }}>Use your NEAR wallet</Text>
          <P muted>Paste the private key from HOT, Meteor, MyNearWallet or the NEAR CLI. We find the account it belongs to.</P>
          <Card>
            <Field label="Private key" value={key} onChangeText={(v) => { setKey(v); setChoices(null); }} placeholder="ed25519:…" secureTextEntry hint="Stored only in this phone's secure storage. Never shared." />
            {choices && (
              <>
                <P small muted>This key opens more than one account. Which one?</P>
                <Chips options={choices.map((c) => ({ value: c, label: shortId(c) }))} onPick={(id) => { setBusy(true); useAccountId(id).catch((e) => setError(errorText(e))).finally(() => setBusy(false)); }} />
              </>
            )}
          </Card>
          {!choices && <Button title="Find my account" onPress={findAccount} busy={busy} disabled={!key.trim()} />}
        </>
      )}

      {step === 'profile' && (
        <>
          <Text style={{ fontSize: 30, fontWeight: '800', color: C.ink, letterSpacing: -0.6, textAlign: 'center', marginTop: 12 }}>Who&apos;s showing up?</Text>
          <P muted>Your name and photo appear on events and gift cards. They&apos;re saved to your public NEAR Social profile.</P>
          <ProfileEditor name={name} onName={setName} imageCid={imageCid} onImageCid={setImageCid} onError={setError} />
          <Button title={name.trim() ? 'Continue' : 'Skip for now'} onPress={saveAndContinue} busy={busy} />
          {!funded && !!name.trim() && <P small muted>Publishing it costs about 0.01 NEAR of storage. We&apos;ll keep it on this phone until your wallet has NEAR, then you can publish it from Me.</P>}
        </>
      )}

      {step === 'fund' && accountId && (
        <>
          <Text style={{ fontSize: 30, fontWeight: '800', color: C.ink, letterSpacing: -0.6 }}>Add NEAR to get started</Text>
          <P muted>Your wallet becomes active the first time it receives NEAR. Claim a gift card from a friend, or send some to your address.</P>
          <Card>
            <QR value={accountId} size={170} label={`QR code of your address, ${accountId}`} />
            <Text selectable style={{ fontFamily: 'monospace', fontSize: 12, color: C.muted, textAlign: 'center' }}>{accountId}</Text>
            <Button variant="secondary" title={copied ? 'Copied' : 'Copy address'} onPress={async () => { await Clipboard.setStringAsync(accountId); setCopied(true); }} />
            {NETWORK === 'testnet' && <Button variant="secondary" title="Get free testnet NEAR" onPress={() => Linking.openURL(FAUCET)} />}
          </Card>
          <Card>
            <Field label="Got a gift card?" value={code} onChangeText={setCode} placeholder="Paste the link or code" />
            <Button
              title="Open card"
              disabled={!parseCardSecret(code)}
              // The claim screen finishes onboarding once the card is claimed.
              onPress={() => router.push({ pathname: '/claim', params: { k: parseCardSecret(code)! } })}
            />
          </Card>
          <Button variant="ghost" title="I'll do this later" onPress={() => done()} />
        </>
      )}

      {error && <Notice tone="red" text={error} />}
    </Screen>
  );
}

function Intro({ busy, onCreate, onImport }: { busy: boolean; onCreate: () => void; onImport: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ gap: 28, paddingTop: 40, paddingBottom: insets.bottom }}>
      <Image source={require('@/assets/images/brand/showup-logo.png')} style={{ width: 190, height: 42 }} resizeMode="contain" accessibilityLabel="ShowUp" />
      <View style={{ gap: 12 }}>
        <Text style={{ fontSize: 40, lineHeight: 44, fontWeight: '800', color: C.ink, letterSpacing: -1.2 }}>
          Show up.{'\n'}
          <Text style={{ color: C.accent }}>Get paid back.</Text>
        </Text>
        <P muted>Events where coming pays, and gift cards anyone can claim. Your money stays in your own wallet on NEAR.</P>
      </View>
      <View style={{ gap: 14 }}>
        <Point title="Lock a small deposit to RSVP" text="Come, and you get it back plus a share of the no-shows' deposits." />
        <Point title="Send money as a link" text="Friends claim it with no wallet setup and no fees." />
        <Point title="Build a record that pays" text="People who show up get lower deposits." />
      </View>
      <View style={{ gap: 10 }}>
        <Button title="Create a new wallet" onPress={onCreate} busy={busy} />
        <Button variant="secondary" title="I already have a NEAR wallet" onPress={onImport} />
      </View>
    </View>
  );
}

function Point({ title, text }: { title: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent, marginTop: 7 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: C.ink }}>{title}</Text>
        <Text style={{ fontSize: 15, color: C.muted, lineHeight: 21 }}>{text}</Text>
      </View>
    </View>
  );
}

function Back({ onPress }: { onPress: () => void }) {
  return <Link title="‹ Back" onPress={onPress} />;
}
