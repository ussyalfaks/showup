import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useAccount } from '@/context/account';
import { Button, C, Card, F, H2, Icon, IconButton, Notice, P, QR, Screen, confirmDestructive, errorText, useLoad, type IconName } from '@/components/kit';
import { CONTRACT_ID } from '@/lib/config';
import { call, signCheckin, view, type Event, type Rsvp } from '@/lib/near';
import { eventStatus } from '@/lib/status';
import { fmt, fromUnits, decimalsFor, symbolFor, nsToDate, shortId } from '@/lib/units';
import { useProfiles } from '@/components/Who';
import { appLink, shareOrCopy } from '@/lib/links';
import { coverUrl, eventPostText, getEventExtras, imageUrl, postToSocial, shareEvent, shoutOutText, type Profile } from '@/lib/social';
import { fmtRange } from '@/lib/eventTime';

const time = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { accountId, publicKey, account, refreshBalance } = useAccount();
  const ev = useLoad(async () => {
    const [event, rsvp, myDeposit] = await Promise.all([
      view<Event | null>('get_event', { event_id: id }),
      accountId ? view<Rsvp | null>('get_rsvp', { event_id: id, account_id: accountId }) : Promise.resolve(null),
      accountId ? view<string>('deposit_for', { event_id: id, account_id: accountId }) : Promise.resolve('0'),
    ]);
    return { event, rsvp, myDeposit };
  }, [id, accountId], 10_000);
  const e0 = ev.data?.event;
  // Cover and end time live on NEAR Social; loaded once (and again when the screen regains focus).
  const extras = useLoad(() => (e0 ? getEventExtras(e0.host, id).catch(() => null) : Promise.resolve(null)), [e0?.host, id]);
  const cover = extras.data?.cover ?? null;
  const end = extras.data?.endsAt ?? null;
  const profiles = useProfiles(e0 ? [e0.host, ...e0.guests] : []);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: 'red' | 'green' | 'muted' } | null>(null);

  if (ev.error) return <Screen back="Event"><Notice tone="red" text={ev.error} /></Screen>;
  if (!ev.data) return <Screen back="Event"><P muted>Loading…</P></Screen>;
  const { event: e, rsvp, myDeposit } = ev.data;
  if (!e) return <Screen back="Event"><Notice tone="red" text={`Event ${id} not found.`} /></Screen>;

  const now = Date.now() * 1e6;
  const isHost = accountId === e.host;
  const isChecker = isHost || (accountId ? e.checkers.includes(accountId) : false);
  const started = now >= Number(e.starts_at);
  const checkinOpen = now >= Number(e.starts_at) - 2 * 3600e9 && now <= Number(e.checkin_until);
  const canSettle = !e.settled && !e.cancelled && now > Number(e.checkin_until);
  const full = e.guests.length >= e.capacity;
  const canRsvp = !isHost && !rsvp && !e.cancelled && !started && !full;
  const split = e.policy === 'split_attendees';
  const discounted = BigInt(myDeposit) < BigInt(e.deposit);
  const start = nsToDate(e.starts_at);

  async function act(label: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
      setMsg({ text: ok, tone: 'green' });
      await ev.reload();
      refreshBalance();
    } catch (err) {
      setMsg({ text: errorText(err), tone: 'red' });
    } finally {
      setBusy(null);
    }
  }

  const rsvpNow = () =>
    act('rsvp', async () => {
      const acc = account();
      if (e.asset === 'near') {
        await call(acc, 'rsvp', { event_id: id, ticket_key: publicKey }, { deposit: BigInt(myDeposit), tgas: 50 });
      } else {
        await call(acc, 'prepare_rsvp', { event_id: id, ticket_key: publicKey }, { tgas: 30 });
        await call(acc, 'ft_transfer_call', { receiver_id: CONTRACT_ID, amount: myDeposit, msg: JSON.stringify({ rsvp: Number(id) }) }, { contractId: e.asset, deposit: 1n, tgas: 100 });
      }
    }, "You're in! Show your ticket QR at the door.");

  const owed = rsvp && !rsvp.withdrawn && (e.cancelled ? BigInt(rsvp.paid) : e.settled && rsvp.checked_in ? BigInt(rsvp.paid) + BigInt(e.share) : 0n);
  const hostOwed = isHost && e.settled && !e.host_withdrawn ? BigInt(e.host_take) : 0n;
  const st = eventStatus(e);
  const statusText = e.cancelled
    ? 'Cancelled'
    : e.settled
      ? `Settled · ${e.attended} of ${e.guests.length} came`
      : checkinOpen
        ? `Check-in open · closes ${time(nsToDate(e.checkin_until))}`
        : canSettle
          ? `Check-in closed at ${time(nsToDate(e.checkin_until))}`
          : `RSVPs open · check-in from ${time(new Date(start.getTime() - 2 * 3600_000))}`;
  const shareEventLink = async () => {
    const r = await shareOrCopy(`${e.title} — ${start.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' })} at ${fmtRange(start, end, time)}${e.location ? `, ${e.location}` : ''}. RSVP on ShowUp: ${appLink(`event/${id}`)}`);
    if (r === 'copied') setMsg({ text: 'Event link copied. Paste it anywhere.', tone: 'green' });
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <ScrollView contentContainerStyle={{ paddingBottom: (canRsvp ? 120 : 32) + insets.bottom }}>
        <Hero cid={cover} hosting={isHost} onShare={shareEventLink} />

        <View style={{ paddingHorizontal: 20, gap: 16, marginTop: -28, width: '100%', maxWidth: 640, alignSelf: 'center' }}>
          {/* Title block */}
          <View style={{ alignItems: 'center', gap: 10 }}>
            {e.location ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="map-pin" size={20} color={C.coral} />
                <Text style={{ fontFamily: F.display, fontSize: 24, color: C.ink }} numberOfLines={1}>{e.location}</Text>
              </View>
            ) : null}
            <StatusPill text={statusText} tone={st.tone} />
            <Text accessibilityRole="header" style={{ fontFamily: F.display, fontSize: 30, lineHeight: 34, color: C.ink, textAlign: 'center', letterSpacing: -0.6, textDecorationLine: e.cancelled ? 'line-through' : 'none' }}>
              {e.title}
            </Text>
            <Text style={{ fontFamily: F.body, fontSize: 15, color: C.muted }}>
              {start.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' })} · {fmtRange(start, end, time)}
            </Text>
          </View>

          {isHost && <PersonCard account={e.host} profile={profiles[e.host]} you badge="Host" />}

          {/* Stats */}
          <View style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: 22, borderWidth: 1, borderColor: C.line }}>
            <StatCell first value={fromUnits(e.deposit, decimalsFor(e.asset))} unit={symbolFor(e.asset)} label="Deposit" />
            <StatCell value={String(e.guests.length)} unit={`/${e.capacity}`} label="Going" muted />
            <StatCell value={String(e.attended)} label="Checked in" />
          </View>

          {isHost && (
            <P small muted>
              {split ? "No-shows lose their deposit; it's shared by everyone who came." : 'No-shows lose their deposit to you, the host.'}
              {e.reliable ? ` Reliable guests (${e.reliable.min_events}+ events, ${e.reliable.min_rate_pct}%+ attendance) pay ${100 - e.reliable.discount_pct}%.` : ''}
            </P>
          )}

          {/* ---------------- guest: ticket, collect, status */}
          {rsvp && !rsvp.checked_in && !e.settled && !e.cancelled && (checkinOpen ? <TicketCard eventId={id} title={e.title} /> : <Notice tone="accent" icon="check-circle" text={`You're going. Your ticket QR appears here when check-in opens at ${time(new Date(start.getTime() - 2 * 3600_000))}.`} />)}
          {rsvp?.checked_in && !e.settled && <Notice tone="green" icon="check-circle" text={`You're checked in. Your deposit${split ? ' and your share' : ''} can be collected after check-in closes at ${time(nsToDate(e.checkin_until))}.`} />}
          {rsvp && !rsvp.checked_in && e.settled && <Notice tone="red" text="You didn't check in, so your deposit went to the pot." />}
          {owed ? <Button title={`Collect ${fmt(owed, e.asset)}`} icon="download" onPress={() => act('withdraw', () => call(account(), 'withdraw', { event_id: id }, { tgas: 100 }), 'Sent to your wallet.')} busy={busy === 'withdraw'} /> : null}
          {rsvp?.withdrawn && <P muted small>You collected your money from this event.</P>}
          {!isHost && !rsvp && full && !e.cancelled && <Notice text="This event is full." />}

          {/* ---------------- host / door helper */}
          {isChecker && checkinOpen && !e.settled && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Scan guests at the door"
              onPress={() => router.push({ pathname: '/scan', params: { mode: 'checkin', event: id } })}
              style={({ pressed }) => ({ minHeight: 58, borderRadius: 999, backgroundColor: C.navy, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, opacity: pressed ? 0.85 : 1 })}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.coral, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="maximize" size={16} color={C.navy} />
              </View>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 17, color: '#FFFFFF' }}>Scan guests at the door</Text>
            </Pressable>
          )}
          {canSettle && (
            <Button variant="brand" title="Settle the event" icon="check" onPress={() => act('settle', () => call(account(), 'settle', { event_id: id }, { tgas: 300 }), 'Settled. Attendees can collect now.')} busy={busy === 'settle'} />
          )}
          {hostOwed > 0n && <Button title={`Collect ${fmt(hostOwed, e.asset)} (no-show deposits)`} icon="download" onPress={() => act('withdraw', () => call(account(), 'withdraw', { event_id: id }, { tgas: 100 }), 'Sent to your wallet.')} busy={busy === 'withdraw'} />}
          {e.settled && (
            <Card>
              <P>{e.attended} of {e.guests.length} showed up. Pot from no-shows: {fmt(e.pot, e.asset)}.</P>
              {split && e.attended > 0 && <P small muted>Each attendee got +{fmt(e.share, e.asset)} on top of their deposit.</P>}
            </Card>
          )}
          {msg && <Notice tone={msg.tone} text={msg.text} />}

          {isHost && <HostTools e={e} id={id} end={end} busy={busy} act={act} />}

          {/* ---------------- guest view: how it works, host, who's going */}
          {!isHost && (
            <Card style={{ gap: 14, padding: 18 }}>
              <Text style={{ fontFamily: F.display, fontSize: 19, color: C.ink }}>How your deposit works</Text>
              <Step n={1} text={`Lock ${fmt(myDeposit !== '0' ? myDeposit : e.deposit, e.asset)} to RSVP. The contract holds it, not the host.`} />
              <Step n={2} text="Get scanned at the door before check-in closes." />
              <Step n={3} coral text={split ? 'Get it back, plus a share of what no-shows left behind.' : "Get it back. No-shows' deposits go to the host."} />
              {e.reliable ? <P small muted>Reliable guests ({e.reliable.min_events}+ events, {e.reliable.min_rate_pct}%+ attendance) pay {100 - e.reliable.discount_pct}%.</P> : null}
            </Card>
          )}
          {!isHost && (
            <>
              <H2>Hosted by</H2>
              <PersonCard account={e.host} profile={profiles[e.host]} />
            </>
          )}

          {isHost ? (
            <HostGuests e={e} id={id} profiles={profiles} />
          ) : (
            e.guests.length > 0 && (
              <>
                <H2>Who&apos;s going</H2>
                <Card style={{ padding: 0, gap: 0 }}>
                  {e.guests.map((g, i) => (
                    <PersonRow key={g} account={g} profile={profiles[g]} you={g === accountId} divider={i > 0} />
                  ))}
                </Card>
              </>
            )
          )}

          {isHost && !started && !e.cancelled && (
            <Button
              variant="caution"
              title="Cancel event"
              busy={busy === 'cancel'}
              onPress={async () => {
                const ok = await confirmDestructive('Cancel This Event?', `Every guest gets their full deposit back and the event can't be reopened.${e.guests.length ? ` ${e.guests.length} ${e.guests.length === 1 ? 'person has' : 'people have'} RSVPed.` : ''}`, 'Cancel Event');
                if (ok) act('cancel', () => call(account(), 'cancel_event', { event_id: id }, { tgas: 30 }), 'Cancelled. Guests can collect their full deposit.');
              }}
            />
          )}
        </View>
      </ScrollView>

      {/* Sticky RSVP bar */}
      {canRsvp && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 14) }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.display, fontSize: 22, color: C.ink }}>{fmt(myDeposit, e.asset)}</Text>
            <Text style={{ fontFamily: F.body, fontSize: 13, color: C.muted }}>{discounted ? 'Reliability discount applied' : 'back when you show up'}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Lock deposit and RSVP"
            disabled={busy === 'rsvp'}
            onPress={rsvpNow}
            style={({ pressed }) => ({ minHeight: 54, paddingHorizontal: 22, borderRadius: 999, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center', opacity: pressed || busy === 'rsvp' ? 0.8 : 1 })}>
            {busy === 'rsvp' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: '#FFFFFF' }}>Lock deposit &amp; RSVP</Text>}
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** Cover photo (or a purple brand header) with back, share and "You're hosting" over it. */
function Hero({ cid, hosting, onShare }: { cid: string | null; hosting: boolean; onShare: () => void }) {
  const insets = useSafeAreaInsets();
  const height = cid ? 330 : 230;
  return (
    <View style={{ height, overflow: 'hidden', backgroundColor: C.accent }}>
      {/* Brand header; a cover photo (slow from IPFS the first time) loads over it. */}
      <View style={{ position: 'absolute', right: -60, top: insets.top - 10, width: 190, height: 190, borderRadius: 95, backgroundColor: C.coral }} />
      <View style={{ position: 'absolute', left: 40, top: insets.top + 70, width: 54, height: 54, borderRadius: 27, borderWidth: 3, borderColor: 'rgba(255,255,255,0.6)' }} />
      {cid ? <Image source={{ uri: coverUrl(cid) }} style={{ position: 'absolute', inset: 0, width: '100%', height }} resizeMode="cover" accessibilityLabel="Event cover photo" /> : null}
      {/* Fade into the page */}
      <Svg width="100%" height={140} style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Defs>
          <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.paper} stopOpacity={0} />
            <Stop offset="1" stopColor={C.paper} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="140" fill="url(#fade)" />
      </Svg>
      <View style={{ position: 'absolute', top: insets.top + 10, left: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconButton round icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={{ flex: 1 }} />
        {hosting && (
          <View style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: C.navy, justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.bodyBold, fontSize: 14, color: '#FFFFFF' }}>You&apos;re hosting</Text>
          </View>
        )}
        <IconButton round icon="share" label="Share event" onPress={onShare} />
      </View>
    </View>
  );
}

function StatusPill({ text, tone }: { text: string; tone: string }) {
  const [bg, fg] = tone === 'green' ? [C.greenSoft, C.greenInk] : tone === 'red' ? [C.redSoft, C.red] : tone === 'amber' ? [C.amberSoft, C.amber] : tone === 'muted' ? [C.field, C.mutedInk] : [C.accentSoft, C.purpleInk];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: bg }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: fg }} />
      <Text style={{ fontFamily: F.bodyBold, fontSize: 14, color: fg }}>{text}</Text>
    </View>
  );
}

function StatCell({ value, unit, label, first, muted }: { value: string; unit?: string; label: string; first?: boolean; muted?: boolean }) {
  return (
    <View style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 14, gap: 2, borderLeftWidth: first ? 0 : 1, borderStyle: 'dashed', borderLeftColor: C.line }}>
      <Text style={{ fontFamily: F.display, fontSize: 22, color: C.ink }} numberOfLines={1}>
        {value}
        {unit ? <Text style={{ fontSize: 14, color: muted ? C.muted : C.accent }}>{unit.startsWith('/') ? unit : ` ${unit}`}</Text> : null}
      </Text>
      <Text style={{ fontFamily: F.body, fontSize: 13, color: C.muted }}>{label}</Text>
    </View>
  );
}

function Step({ n, text, coral }: { n: number; text: string; coral?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: coral ? C.coralSoft : C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: F.bodyBold, fontSize: 14, color: coral ? C.red : C.purpleInk }}>{n}</Text>
      </View>
      <Text style={{ flex: 1, fontFamily: F.body, fontSize: 15, lineHeight: 21, color: C.ink, paddingTop: 4 }}>{text}</Text>
    </View>
  );
}

function Avatar({ account, profile, coral }: { account: string; profile?: Profile | null; coral?: boolean }) {
  const img = imageUrl(profile?.image);
  const initial = (profile?.name ?? account).slice(0, 1).toUpperCase();
  return (
    <View style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: coral ? C.coral : C.accentSoft }}>
      {img ? <Image source={{ uri: img }} style={{ width: 44, height: 44 }} /> : <Text style={{ fontFamily: F.bodyBold, fontSize: 17, color: coral ? C.navy : C.purpleInk }}>{initial}</Text>}
    </View>
  );
}

function PersonRow({ account, profile, you, badge, divider, coral = true }: { account: string; profile?: Profile | null; you?: boolean; badge?: ReactNode; divider?: boolean; coral?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: divider ? 1 : 0, borderTopColor: C.line }}>
      <Avatar account={account} profile={profile} coral={coral} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontFamily: F.bodyBold, fontSize: 16, color: C.ink }}>
          {profile?.name ?? shortId(account)}
          {you ? <Text style={{ fontFamily: F.body, color: C.muted }}> (you)</Text> : null}
        </Text>
        <Text numberOfLines={1} style={{ fontFamily: F.monoRegular, fontSize: 12, color: C.muted }}>@{shortId(account)}</Text>
      </View>
      {badge}
    </View>
  );
}

function PersonCard({ account, profile, you, badge }: { account: string; profile?: Profile | null; you?: boolean; badge?: string }) {
  return (
    <Card style={{ padding: 0 }}>
      <PersonRow account={account} profile={profile} you={you} coral={false} badge={badge ? <SmallPill text={badge} /> : undefined} />
    </Card>
  );
}

function SmallPill({ text, tone = 'purple' }: { text: string; tone?: 'purple' | 'muted' | 'green' }) {
  const [bg, fg] = tone === 'green' ? [C.greenSoft, C.greenInk] : tone === 'muted' ? [C.field, C.mutedInk] : [C.accentSoft, C.purpleInk];
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: bg }}>
      <Text style={{ fontFamily: F.bodyBold, fontSize: 12, color: fg }}>{text}</Text>
    </View>
  );
}

/** Host's guest list with each guest's check-in state. Loaded on open and on return, not polled. */
function HostGuests({ e, id, profiles }: { e: Event; id: string; profiles: Record<string, Profile | null> }) {
  const rsvps = useLoad(() => Promise.all(e.guests.map((g) => view<Rsvp | null>('get_rsvp', { event_id: id, account_id: g }))), [id, e.guests.join(','), e.attended]);
  return (
    <>
      <H2 right={<Text style={{ fontFamily: F.body, fontSize: 13, color: C.muted }}>{e.guests.length} going · {e.attended} checked in</Text>}>Guests</H2>
      {e.guests.length === 0 ? (
        <P small muted>No RSVPs yet. Share the event so people can find it.</P>
      ) : (
        <Card style={{ padding: 0, gap: 0 }}>
          {e.guests.map((g, i) => {
            const r = rsvps.data?.[i];
            return <PersonRow key={g} account={g} profile={profiles[g]} divider={i > 0} badge={r ? <SmallPill text={r.checked_in ? 'Checked in' : 'Not in yet'} tone={r.checked_in ? 'green' : 'muted'} /> : undefined} />;
          })}
        </Card>
      )}
    </>
  );
}

function HostTools({ e, id, end, busy, act }: { e: Event; id: string; end: Date | null; busy: string | null; act: (l: string, f: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const { account, accountId } = useAccount();
  const [helper, setHelper] = useState('');
  if (e.cancelled) return null;
  const shareRow = e.settled
    ? {
        icon: 'heart' as IconName,
        title: 'Thank attendees on NEAR Social',
        key: 'shout',
        run: () =>
          act('shout', async () => {
            const rsvps = await Promise.all(e.guests.map((g) => view<Rsvp | null>('get_rsvp', { event_id: id, account_id: g })));
            const came = e.guests.filter((_, i) => rsvps[i]?.checked_in);
            await postToSocial(account(), accountId!, shoutOutText(e.title, came, e.guests.length));
          }, 'Posted to the #showup feed. Attendees with named accounts were tagged.'),
      }
    : {
        icon: 'share-2' as IconName,
        title: 'Share on NEAR Social',
        key: 'share',
        run: () =>
          act('share', () => shareEvent(account(), accountId!, id, eventPostText({ title: e.title, location: e.location, startsAt: nsToDate(e.starts_at), endsAt: end, deposit: fmt(e.deposit, e.asset), split: e.policy === 'split_attendees' })), 'Posted to the #showup feed on NEAR Social.'),
      };
  return (
    <Card style={{ gap: 14, padding: 18 }}>
      <Text style={{ fontFamily: F.display, fontSize: 19, color: C.ink }}>Host tools</Text>
      {!e.settled && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: F.bodyBold, fontSize: 15, color: C.ink }}>
            Add a door helper <Text style={{ fontFamily: F.body, color: C.muted }}>— they can scan guests</Text>
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.field, borderRadius: 999, paddingLeft: 18, padding: 5 }}>
            <TextInput
              value={helper}
              onChangeText={setHelper}
              placeholder="friend.testnet"
              placeholderTextColor={C.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Door helper's account"
              style={{ flex: 1, minHeight: 44, fontFamily: F.monoRegular, fontSize: 15, color: C.ink }}
            />
            <Button compact variant="brand" title="Add" disabled={!helper.trim()} busy={busy === 'helper'} onPress={() => act('helper', () => call(account(), 'add_checker', { event_id: id, account: helper.trim() }, { tgas: 30 }), 'Helper added. They can now scan guests.')} style={{ paddingHorizontal: 18 }} />
          </View>
          {e.checkers.length > 0 && <P small muted>Helpers: {e.checkers.map(shortId).join(', ')}</P>}
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={shareRow.title}
        disabled={busy === shareRow.key}
        onPress={shareRow.run}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: C.line, opacity: pressed ? 0.7 : 1 })}>
        <Icon name={shareRow.icon} size={18} color={C.accent} />
        <Text style={{ flex: 1, fontFamily: F.bodyBold, fontSize: 15, color: C.ink }}>{shareRow.title}</Text>
        {busy === shareRow.key ? <ActivityIndicator color={C.accent} /> : <Icon name="chevron-right" size={18} color={C.muted} />}
      </Pressable>
    </Card>
  );
}

/**
 * The guest's door ticket: a live "admit one" ticket whose QR is re-signed every 10 seconds.
 * The countdown makes the anti-screenshot rule visible.
 */
const REFRESH_S = 10;
function TicketCard({ eventId, title }: { eventId: string; title: string }) {
  const { accountId, secretKey } = useAccount();
  const [payload, setPayload] = useState<string>('');
  const [left, setLeft] = useState(REFRESH_S);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!accountId || !secretKey) return;
    let n = REFRESH_S;
    const make = () => setPayload(JSON.stringify(signCheckin(secretKey, eventId, accountId)));
    make();
    setLeft(n);
    const t = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        make();
        n = REFRESH_S;
      }
      setLeft(n);
    }, 1000);
    return () => clearInterval(t);
  }, [eventId, accountId, secretKey]);
  return (
    <View style={{ borderRadius: 24, overflow: 'hidden', backgroundColor: C.card }}>
      <View style={{ backgroundColor: C.accent, paddingHorizontal: 18, paddingVertical: 14 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: 1.5, color: C.onAccentSoft }}>ADMIT ONE</Text>
        <Text style={{ fontSize: 20, fontFamily: F.display, color: '#FFFFFF' }} numberOfLines={2}>{title}</Text>
      </View>
      <View style={{ alignItems: 'center', padding: 20, gap: 14 }}>
        {payload ? <QR value={payload} size={232} label="Your check-in QR code. Show it to the host at the door." /> : <View style={{ width: 260, height: 260 }} />}
        <View style={{ alignSelf: 'stretch', gap: 6 }} accessible accessibilityLabel={`Live ticket. New code in ${left} seconds.`}>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {Array.from({ length: REFRESH_S }, (_, i) => (
              <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < left ? C.green : C.line }} />
            ))}
          </View>
          <Text style={{ fontFamily: F.bodyBold, fontSize: 14, color: C.greenInk }}>● Live · new code in {left} s</Text>
        </View>
        <P small muted>Show this to the host. The code changes every 10 seconds, so a screenshot won&apos;t get anyone else in.</P>
        {/* For hosts without a working camera (web, simulator): they paste this in "Paste code instead". */}
        <Button
          compact
          variant="secondary"
          icon={copied ? 'check' : 'copy'}
          title={copied ? 'Copied · valid about a minute' : 'Copy ticket code'}
          onPress={async () => {
            await Clipboard.setStringAsync(payload);
            setCopied(true);
            setTimeout(() => setCopied(false), 4000);
          }}
          style={{ alignSelf: 'stretch' }}
        />
      </View>
    </View>
  );
}
