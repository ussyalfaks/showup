import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { useAccount } from '@/context/account';
import { Button, C, Card, Field, H1, H2, Notice, P, Pill, Row, Screen, Stat, confirmDestructive, errorText, useLoad } from '@/components/kit';
import { CONTRACT_ID } from '@/lib/config';
import { call, signCheckin, view, type Event, type Rsvp } from '@/lib/near';
import { eventStatus } from '@/lib/status';
import { fmt, nsToDate, shortId } from '@/lib/units';
import { Who, useProfiles } from '@/components/Who';
import { eventPostText, postToSocial, shareEvent, shoutOutText } from '@/lib/social';

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accountId, publicKey, account, refreshBalance } = useAccount();
  const ev = useLoad(async () => {
    const [event, rsvp, myDeposit] = await Promise.all([
      view<Event | null>('get_event', { event_id: id }),
      accountId ? view<Rsvp | null>('get_rsvp', { event_id: id, account_id: accountId }) : Promise.resolve(null),
      accountId ? view<string>('deposit_for', { event_id: id, account_id: accountId }) : Promise.resolve('0'),
    ]);
    return { event, rsvp, myDeposit };
  }, [id, accountId], 5000);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: 'red' | 'green' | 'muted' } | null>(null);

  if (ev.error) return <Screen padTop={false}><Notice tone="red" text={ev.error} /></Screen>;
  if (!ev.data) return <Screen padTop={false}><P muted>Loading…</P></Screen>;
  const { event: e, rsvp, myDeposit } = ev.data;
  if (!e) return <Screen padTop={false}><Notice tone="red" text={`Event ${id} not found.`} /></Screen>;

  const now = Date.now() * 1e6;
  const isHost = accountId === e.host;
  const isChecker = isHost || (accountId ? e.checkers.includes(accountId) : false);
  const started = now >= Number(e.starts_at);
  const checkinOpen = now >= Number(e.starts_at) - 2 * 3600e9 && now <= Number(e.checkin_until);
  const canSettle = !e.settled && !e.cancelled && now > Number(e.checkin_until);
  const st = eventStatus(e);
  const discounted = BigInt(myDeposit) < BigInt(e.deposit);

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

  return (
    <Screen padTop={false} onRefresh={ev.reload}>
      <Pill text={st.text} tone={st.tone} />
      <H1>{e.title}</H1>
      <P muted>
        {nsToDate(e.starts_at).toLocaleString([], { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
        {e.location ? ` · ${e.location}` : ''}
      </P>
      <Who account={e.host} suffix=" · host" />
      <P small muted>Check-in closes {nsToDate(e.checkin_until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</P>

      <Row>
        <Stat value={fmt(e.deposit, e.asset)} label="deposit" />
        <Stat value={`${e.guests.length}/${e.capacity}`} label="going" />
        <Stat value={e.attended} label="checked in" />
      </Row>
      <P small muted>
        {e.policy === 'split_attendees' ? "No-shows lose their deposit; it's shared by everyone who came." : 'No-shows lose their deposit to the host.'}
        {e.reliable ? ` Reliable guests (${e.reliable.min_events}+ events, ${e.reliable.min_rate_pct}%+ attendance) pay ${100 - e.reliable.discount_pct}%.` : ''}
      </P>

      {/* ---------------- guest */}
      {!isHost && !rsvp && !e.cancelled && !started && (
        <Card tone="accent">
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>Lock {fmt(myDeposit, e.asset)} to RSVP</Text>
          {discounted && <P small>Reliability discount applied — you usually show up. 🙌</P>}
          <P small muted>You get it back when you check in{e.policy === 'split_attendees' ? ', plus a share of the no-shows’ deposits' : ''}.</P>
          <Button title="RSVP" onPress={rsvpNow} busy={busy === 'rsvp'} />
        </Card>
      )}
      {rsvp && !rsvp.checked_in && !e.settled && !e.cancelled && (
        checkinOpen ? <Ticket eventId={id} title={e.title} /> : <Notice text={`You're going. Your ticket QR appears here when check-in opens (2 hours before the start).`} />
      )}
      {rsvp?.checked_in && <Notice tone="green" text="You're checked in. Your deposit comes back after the event is settled." />}
      {rsvp && !rsvp.checked_in && e.settled && <Notice tone="red" text="You didn't check in, so your deposit went to the pot." />}
      {owed ? (
        <Button title={`Collect ${fmt(owed, e.asset)}`} onPress={() => act('withdraw', () => call(account(), 'withdraw', { event_id: id }, { tgas: 100 }), 'Sent to your wallet.')} busy={busy === 'withdraw'} />
      ) : null}
      {rsvp?.withdrawn && <P muted small>You collected your money from this event.</P>}

      {/* ---------------- host */}
      {isChecker && checkinOpen && !e.settled && (
        <Button title="Scan guests at the door" onPress={() => router.push({ pathname: '/scan', params: { mode: 'checkin', event: id } })} />
      )}
      {isHost && <HostTools e={e} id={id} busy={busy} act={act} />}
      {canSettle && (
        <Button variant="secondary" title="Settle the event" onPress={() => act('settle', () => call(account(), 'settle', { event_id: id }, { tgas: 300 }), 'Settled. Attendees can collect now.')} busy={busy === 'settle'} />
      )}
      {hostOwed > 0n && (
        <Button title={`Collect ${fmt(hostOwed, e.asset)} (no-show deposits)`} onPress={() => act('withdraw', () => call(account(), 'withdraw', { event_id: id }, { tgas: 100 }), 'Sent to your wallet.')} busy={busy === 'withdraw'} />
      )}
      {e.settled && (
        <Card>
          <P>{e.attended} of {e.guests.length} showed up. Pot from no-shows: {fmt(e.pot, e.asset)}.</P>
          {e.policy === 'split_attendees' && e.attended > 0 && <P>Each attendee got +{fmt(e.share, e.asset)} on top of their deposit.</P>}
        </Card>
      )}
      {msg && <Notice tone={msg.tone} text={msg.text} />}

      {isHost && <SocialTools e={e} id={id} busy={busy} act={act} />}

      {e.guests.length > 0 && <Guests guests={e.guests} me={accountId} />}
    </Screen>
  );
}

/**
 * The guest's door ticket, and the app's signature: a live "admit one" ticket whose QR is
 * re-signed every 10 seconds. The countdown makes the anti-screenshot rule visible.
 */
const REFRESH_S = 10;
function Ticket({ eventId, title }: { eventId: string; title: string }) {
  const { accountId, secretKey } = useAccount();
  const [payload, setPayload] = useState<string>('');
  const [left, setLeft] = useState(REFRESH_S);
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
    <View style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: C.card, borderWidth: 1, borderColor: C.line }}>
      <View style={{ backgroundColor: C.accent, paddingHorizontal: 18, paddingVertical: 12 }}>
        <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 1.5, color: C.ink }}>ADMIT ONE</Text>
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }} numberOfLines={2}>{title}</Text>
      </View>
      <View style={{ alignItems: 'center', padding: 20, gap: 14 }}>
        <View accessible accessibilityRole="image" accessibilityLabel="Your check-in QR code. Show it to the host at the door.">
          {payload ? <QRCode value={payload} size={240} /> : <View style={{ width: 240, height: 240 }} />}
        </View>
        <View style={{ alignSelf: 'stretch', gap: 6 }} accessible accessibilityLabel={`Live ticket. New code in ${left} seconds.`}>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {Array.from({ length: REFRESH_S }, (_, i) => (
              <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < left ? C.green : C.line }} />
            ))}
          </View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: C.greenInk }}>● Live · new code in {left} s</Text>
        </View>
        <P small muted>Show this to the host. The code changes every 10 seconds, so a screenshot won&apos;t get anyone else in.</P>
      </View>
    </View>
  );
}

function HostTools({ e, id, busy, act }: { e: Event; id: string; busy: string | null; act: (l: string, f: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const { account } = useAccount();
  const [helper, setHelper] = useState('');
  const started = Date.now() * 1e6 >= Number(e.starts_at);
  if (e.settled || e.cancelled) return null;
  return (
    <Card>
      <Text style={{ fontWeight: '800', color: C.ink }}>Host tools</Text>
      <Field label="Add a door helper (can scan guests)" value={helper} onChangeText={setHelper} placeholder="friend.testnet" />
      <Row>
        <Button variant="secondary" title="Add helper" disabled={!helper} busy={busy === 'helper'} onPress={() => act('helper', () => call(account(), 'add_checker', { event_id: id, account: helper.trim() }, { tgas: 30 }), 'Helper added.')} />
        {!started && (
          <Button
            variant="ghost"
            title="Cancel event"
            busy={busy === 'cancel'}
            onPress={async () => {
              const ok = await confirmDestructive('Cancel This Event?', `Every guest gets their full deposit back and the event can't be reopened.${e.guests.length ? ` ${e.guests.length} ${e.guests.length === 1 ? 'person has' : 'people have'} RSVPed.` : ''}`, 'Cancel Event');
              if (ok) act('cancel', () => call(account(), 'cancel_event', { event_id: id }, { tgas: 30 }), 'Cancelled. Guests can collect their full deposit.');
            }}
          />
        )}
      </Row>
    </Card>
  );
}

function Guests({ guests, me }: { guests: string[]; me: string | null }) {
  const profiles = useProfiles(guests);
  return (
    <>
      <H2>Guests</H2>
      <Card>
        {guests.map((g) => (
          <Who key={g} account={g} profile={profiles[g] ?? null} suffix={g === me ? ' (you)' : undefined} />
        ))}
      </Card>
    </>
  );
}

/** Host: share the event to NEAR Social, and thank attendees after settling. */
function SocialTools({ e, id, busy, act }: { e: Event; id: string; busy: string | null; act: (l: string, f: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const { account, accountId } = useAccount();
  if (e.cancelled) return null;
  if (e.settled) {
    return (
      <Button
        variant="secondary"
        title="Thank attendees on NEAR Social"
        busy={busy === 'shout'}
        onPress={() =>
          act('shout', async () => {
            const rsvps = await Promise.all(e.guests.map((g) => view<Rsvp | null>('get_rsvp', { event_id: id, account_id: g })));
            const came = e.guests.filter((_, i) => rsvps[i]?.checked_in);
            await postToSocial(account(), accountId!, shoutOutText(e.title, came, e.guests.length));
          }, 'Posted to the #showup feed. Attendees with named accounts were tagged.')
        }
      />
    );
  }
  return (
    <Button
      variant="ghost"
      title="Share on NEAR Social"
      busy={busy === 'share'}
      onPress={() =>
        act('share', () => shareEvent(account(), accountId!, id, eventPostText({ title: e.title, location: e.location, startsAt: nsToDate(e.starts_at), deposit: fmt(e.deposit, e.asset), split: e.policy === 'split_attendees' })), 'Posted to the #showup feed on NEAR Social.')
      }
    />
  );
}
