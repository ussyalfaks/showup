import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAccount } from '@/context/account';
import { Button, C, Card, Chips, Field, H1, Notice, P, Screen, Segmented, errorText } from '@/components/kit';
import { EVENT_FEE, USDC_ID } from '@/lib/config';
import { call } from '@/lib/near';
import { fromUnits, toUnits } from '@/lib/units';
import { eventPostText, shareEvent } from '@/lib/social';

const pad = (n: number) => String(n).padStart(2, '0');
/** Date -> "YYYY-MM-DD HH:MM" in local time (the field's format). */
function toField(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function at(daysAhead: number, h: number, m = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(h, m, 0, 0);
  return d;
}
function nextSaturday() {
  const d = at(0, 14);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return d;
}
/** Quick picks for the start time. "In 15 min" is the fastest way to try a whole event. */
function startPresets() {
  const soon = new Date(Date.now() + 15 * 60_000);
  soon.setSeconds(0, 0);
  const tonight = at(0, 19);
  return [
    { value: toField(soon), label: 'In 15 min' },
    ...(tonight.getTime() > Date.now() + 10 * 60_000 ? [{ value: toField(tonight), label: 'Tonight 7 PM' }] : []),
    { value: toField(at(1, 18)), label: 'Tomorrow 6 PM' },
    { value: toField(nextSaturday()), label: 'Saturday 2 PM' },
  ];
}
const CHECKIN = [15, 30, 60, 90, 120].map((m) => ({ value: m, label: m < 60 ? `${m} min` : `${m / 60} h` }));
const ASSETS = [{ value: 'near' as const, label: 'NEAR' }, { value: 'usdc' as const, label: 'USDC' }];

/** "YYYY-MM-DD HH:MM" in local time -> ms */
function parseLocal(s: string): number {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!m) throw new Error('Use the format YYYY-MM-DD HH:MM');
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}

export default function NewEvent() {
  const { account, accountId } = useAccount();
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [when, setWhen] = useState(() => toField(at(1, 18)));
  const [checkin, setCheckin] = useState(90);
  const [asset, setAsset] = useState<'near' | 'usdc'>('near');
  const [deposit, setDeposit] = useState('1');
  const [capacity, setCapacity] = useState('50');
  const [split, setSplit] = useState(true);
  const [reliable, setReliable] = useState(true);
  const [share, setShare] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    setBusy(true);
    try {
      if (!title.trim()) throw new Error('Give the event a name');
      const startsAt = parseLocal(when);
      if (startsAt < Date.now() + 10 * 60_000) throw new Error('Start time must be at least 10 minutes from now');
      const id = await call<string>(account(), 'create_event', {
        title: title.trim(),
        location: location.trim(),
        starts_at_ms: String(startsAt),
        checkin_minutes: checkin,
        asset: asset === 'near' ? 'near' : USDC_ID,
        deposit: toUnits(deposit, asset === 'near' ? 24 : 6),
        capacity: Number(capacity),
        policy: split ? 'split_attendees' : 'host',
        reliable: reliable ? { min_events: 3, min_rate_pct: 80, discount_pct: 50 } : null,
      }, { deposit: EVENT_FEE, tgas: 50 });
      if (share) {
        setStatus('Event created. Posting it to NEAR Social…');
        const text = eventPostText({ title: title.trim(), location: location.trim(), startsAt: new Date(startsAt), deposit: `${deposit} ${asset === 'near' ? 'NEAR' : 'USDC'}`, split });
        // Sharing is a bonus: the event exists either way.
        await shareEvent(account(), accountId!, String(id), text).catch(() => setStatus('Event created (sharing to NEAR Social failed — you can share it from the event page).'));
      }
      router.replace(`/event/${id}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padTop={false}>
      <H1>Host an event</H1>
      <Card>
        <Field label="Name" value={title} onChangeText={setTitle} placeholder="NEAR Lagos builders meetup" maxLength={100} />
        <Field label="Where" value={location} onChangeText={setLocation} placeholder="Yaba, Lagos" maxLength={140} />
        <Field label="Starts (local time)" value={when} onChangeText={setWhen} placeholder="2026-11-20 18:00" hint="Pick one below or type YYYY-MM-DD HH:MM. Check-in opens 2 hours before." />
        <Chips label="Start time presets" options={startPresets()} value={when} onPick={setWhen} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: C.ink, marginTop: 6 }}>Check-in stays open after the start for</Text>
        <Chips label="Check-in window" options={CHECKIN} value={checkin} onPick={setCheckin} />
      </Card>
      <Card>
        <Segmented label="Deposit currency" value={asset} options={ASSETS} onChange={setAsset} />
        <Field label={`Deposit per guest (${asset === 'near' ? 'NEAR' : 'USDC'})`} value={deposit} onChangeText={setDeposit} keyboardType="decimal-pad" />
        <Field label="Capacity" value={capacity} onChangeText={setCapacity} keyboardType="number-pad" hint="Up to 150 guests." />
        <ToggleRow label="No-shows' deposits go to the people who came" hint={split ? 'Showing up pays.' : 'Off: the deposits go to you, the host.'} value={split} onChange={setSplit} />
        <ToggleRow label="Half price for reliable guests" hint="3+ events with 80%+ attendance pay 50% of the deposit." value={reliable} onChange={setReliable} />
        <ToggleRow label="Share on NEAR Social" hint="Posts it to the public #showup feed so people can find it (one-time ~0.05 NEAR storage, unused part refunded)." value={share} onChange={setShare} />
      </Card>
      <P muted small>Hosting costs {fromUnits(EVENT_FEE, 24)} NEAR (contract storage). You never hold guests&apos; money — the contract does.</P>
      <Button title="Create event" onPress={create} busy={busy} />
      {status && <Notice text={status} />}
      {error && <Notice tone="red" text={error} />}
    </Screen>
  );
}

function ToggleRow({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: C.ink }}>{label}</Text>
        <Text style={{ color: C.muted, fontSize: 13 }}>{hint}</Text>
      </View>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: C.accent }} thumbColor="#fff" />
    </View>
  );
}
