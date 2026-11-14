import { useState } from 'react';
import { Pressable, Share, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAccount } from '@/context/account';
import { Button, C, Card, F, H1, H2, Icon, Notice, P, QR, Screen, confirmDestructive, errorText, useLoad } from '@/components/kit';
import { call, cardLink, view, type Card as CardT } from '@/lib/near';
import { loadCardSecrets, shareInfo } from '@/lib/cardstore';
import { claimParams, parseCardLink } from '@/lib/cardcode';
import { RedeemCode } from '@/components/RedeemCode';
import { fmt } from '@/lib/units';
import { Who } from '@/components/Who';

export default function Cards() {
  const { accountId, account, refreshBalance } = useAccount();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: 'green' | 'red' } | null>(null);
  const mine = useLoad(async () => {
    if (!accountId) return { cards: [] as CardT[], secrets: {} as Record<string, string> };
    const [cards, secrets] = await Promise.all([view<CardT[]>('cards_by', { account_id: accountId }), loadCardSecrets()]);
    return { cards: [...cards].sort((a, b) => Number(b.created_at) - Number(a.created_at)), secrets };
  }, [accountId], 15_000);
  const pasted = parseCardLink(code);

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

  return (
    <Screen onRefresh={mine.reload} tabBar>
      <View style={{ gap: 6 }}>
        <H1>Gift cards</H1>
        <P muted small>Send NEAR or USDC as a link or QR, plus a redeem code. No wallet, no gas, no app store detour.</P>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create a gift card"
          onPress={() => router.push('/card/new')}
          style={({ pressed }) => ({ flex: 1, minHeight: 132, padding: 16, borderRadius: 24, backgroundColor: C.coral, justifyContent: 'space-between', opacity: pressed ? 0.85 : 1 })}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={20} color={C.coral} />
          </View>
          <Text style={{ fontFamily: F.display, fontSize: 20, lineHeight: 22, color: C.navy }}>Create a{'\n'}gift card</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scan a card's QR"
          onPress={() => router.push({ pathname: '/scan', params: { mode: 'claim' } })}
          style={({ pressed }) => ({ flex: 1, minHeight: 132, padding: 16, borderRadius: 24, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, justifyContent: 'space-between', opacity: pressed ? 0.85 : 1 })}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="maximize" size={18} color={C.accent} />
          </View>
          <Text style={{ fontFamily: F.display, fontSize: 20, lineHeight: 22, color: C.ink }}>Scan a{'\n'}card&apos;s QR</Text>
        </Pressable>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: F.bodyBold, fontSize: 15, color: C.ink }}>Got a link instead?</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 999, borderWidth: 1, borderColor: C.line, paddingLeft: 18, padding: 5 }}>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="showup://claim?c=…"
            placeholderTextColor={C.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Paste the card link"
            style={{ flex: 1, minHeight: 44, fontFamily: F.monoRegular, fontSize: 14, color: C.ink }}
          />
          <Button compact title="Open" disabled={!pasted} onPress={() => router.push({ pathname: '/claim', params: claimParams(pasted!) })} />
        </View>
        {pasted?.kind === 'coded' && <P small muted>You&apos;ll enter the redeem code on the next screen.</P>}
      </View>

      <H2>Cards you sent</H2>
      {msg && <Notice tone={msg.tone} text={msg.text} />}
      {mine.error && <Notice tone="red" text={mine.error} />}
      {mine.data && !mine.data.cards.length && <P muted small>None yet. Your first card takes about a minute.</P>}
      {mine.data?.cards.map((c) => {
        const stored = mine.data!.secrets[c.public_key];
        const share = stored ? shareInfo(c.public_key, stored, cardLink) : null;
        const live = !c.claimed_by && !c.cancelled;
        const [label, dot] = c.cancelled ? ['Taken back', C.muted] : c.claimed_by ? ['Claimed', C.green] : !c.funded ? ['Waiting for USDC', C.amber] : ['Waiting to be claimed', C.coral];
        const isOpen = open === c.public_key;
        return (
          <Card key={c.public_key} style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 104, height: 64, borderRadius: 14, backgroundColor: live ? C.accent : C.field, overflow: 'hidden', justifyContent: 'flex-end', padding: 8 }}>
                <View style={{ position: 'absolute', right: -14, top: -14, width: 34, height: 34, borderRadius: 17, backgroundColor: live ? C.coral : C.line }} />
                <Text adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontFamily: F.display, fontSize: 15, color: live ? '#FFFFFF' : C.muted }} numberOfLines={1}>{fmt(c.amount, c.asset)}</Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: C.ink }} numberOfLines={1}>{c.message ? `“${c.message}”` : fmt(c.amount, c.asset)}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
                  <Text style={{ fontFamily: F.body, fontSize: 14, color: C.muted }}>{label}</Text>
                </View>
              </View>
            </View>
            {c.claimed_by && <Who account={c.claimed_by} suffix=" claimed it" size={22} />}
            {live && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {share && <Button compact variant="secondary" title={isOpen ? 'Hide' : 'Show QR'} onPress={() => setOpen(isOpen ? null : c.public_key)} style={{ flex: 1 }} />}
                {share && (
                  <Button
                    compact
                    variant="secondary"
                    title="Share link"
                    style={{ flex: 1.2 }}
                    onPress={() => Share.share({ message: `You got ${fmt(c.amount, c.asset)}! Claim it in ShowUp: ${share.link}${share.code ? "\nI'll send you the redeem code separately." : ''}` })}
                  />
                )}
                {/* Taking back only needs your wallet, so it works for cards made on another phone too. */}
                <Button compact variant="caution" title="Take back" busy={busy === c.public_key} onPress={() => takeBack(c)} style={{ flex: 1.25 }} />
              </View>
            )}
            {live && share && isOpen && (
              <View style={{ gap: 12 }}>
                <QR value={share.link} size={190} label={`QR code for a ${fmt(c.amount, c.asset)} gift card`} />
                {share.code && <RedeemCode code={share.code} />}
              </View>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
