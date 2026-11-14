import { useState } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAccount } from '@/context/account';
import { C, Card, Chips, F, Field, Icon, Notice, Screen, Segmented, Ticket, errorText } from '@/components/kit';
import { EVENT_FEE, USDC_ID } from '@/lib/config';
import { call } from '@/lib/near';
import { fromUnits, toUnits } from '@/lib/units';
import { SOCIAL_DEPOSIT, eventPostText, shareEvent } from '@/lib/social';
import { StartTimePicker } from '@/components/StartTimePicker';
import { at, checkinSummary, fmtTime, sameMinute, startPresets, startProblem, zoneName } from '@/lib/eventTime';

const CHECKIN = [15, 30, 60, 90, 120].map((m) => ({ value: m, label: m < 60 ? `${m}m` : `${m / 60}h` }));
const ASSETS = [{ value: 'near' as const, label: 'NEAR' }, { value: 'usdc' as const, label: 'USDC' }];

export default function NewEvent() {
  const { account, accountId } = useAccount();
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [start, setStart] = useState(() => at(new Date(), 1, 18));
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
  const insets = useSafeAreaInsets();

  async function create() {
    setError(null);
    setBusy(true);
    try {
      if (!title.trim()) throw new Error('Give the event a name');
      const problem = startProblem(start);
      if (problem) throw new Error(problem);
      const startsAt = start.getTime();
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

  const sym = asset === 'near' ? 'NEAR' : 'USDC';
  const previewWhen = `${start.toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime(start)}`;
  const startError = startProblem(start);
  const presets = startPresets();
  const cost = EVENT_FEE + (share ? SOCIAL_DEPOSIT : 0n);
  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <Screen back="New event">
        {/* Ticket preview */}
        <Ticket
          stubRight
          stubWidth={86}
          bg={C.accent}
          border={C.accent}
          notch={C.paper}
          stub={
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: F.display, fontSize: 26, color: '#FFFFFF' }}>{deposit || '0'}</Text>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 12, color: C.onAccentSoft }}>{sym}</Text>
            </View>
          }>
          <Text style={{ fontFamily: F.bodyBold, fontSize: 11, letterSpacing: 1.4, color: C.onAccentSoft }}>TICKET PREVIEW</Text>
          <Text style={{ fontFamily: F.display, fontSize: 22, lineHeight: 26, color: '#FFFFFF' }} numberOfLines={2}>{title.trim() || 'Your event name'}</Text>
          <Text style={{ fontFamily: F.monoRegular, fontSize: 13, color: C.onAccentSoft }}>{previewWhen}</Text>
        </Ticket>

        <Field label="Event name" value={title} onChangeText={setTitle} placeholder="NEAR Lagos builders meetup" maxLength={100} />
        <Field label="Where" value={location} onChangeText={setLocation} placeholder="Yaba, Lagos" maxLength={140} />

        <View style={{ gap: 10 }}>
          <Text style={labelStyle}>Starts</Text>
          <Chips label="Start time presets" options={presets.map((p) => ({ value: p.date.getTime(), label: p.label }))} value={presets.find((p) => sameMinute(p.date, start))?.date.getTime()} onPick={(t) => setStart(new Date(t))} />
          <StartTimePicker value={start} onChange={setStart} invalid={!!startError} />
          <Text style={{ fontFamily: F.body, color: startError ? C.red : C.muted, fontSize: 13, lineHeight: 18 }}>
            {startError ?? `${checkinSummary(start, checkin)} Times are in your time zone (${zoneName(start)}).`}
          </Text>
        </View>

        <View style={{ gap: 10 }}>
          <Text style={labelStyle}>Check-in stays open after the start for</Text>
          <Segmented label="Check-in window" value={String(checkin)} options={CHECKIN.map((o) => ({ value: String(o.value), label: o.label }))} onChange={(v) => setCheckin(Number(v))} />
        </View>

        <Card style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Text style={labelStyle}>Deposit</Text>
            <View style={{ width: 160 }}>
              <Segmented soft label="Deposit currency" value={asset} options={ASSETS} onChange={setAsset} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field filled label="Per guest" value={deposit} onChangeText={setDeposit} keyboardType="decimal-pad" style={{ fontFamily: F.display, fontSize: 20 }} />
            </View>
            <View style={{ flex: 1 }}>
              <Field filled label="Capacity (max 150)" value={capacity} onChangeText={setCapacity} keyboardType="number-pad" style={{ fontFamily: F.display, fontSize: 20 }} />
            </View>
          </View>
        </Card>

        <Card style={{ gap: 0, paddingVertical: 4 }}>
          <ToggleRow label="No-shows fund the people who came" hint={split ? 'Their deposits are split among attendees.' : 'Off: the deposits go to you, the host.'} value={split} onChange={setSplit} />
          <ToggleRow divider label="Half price for reliable guests" hint="3+ events with 80%+ attendance pay 50%." value={reliable} onChange={setReliable} />
          <ToggleRow divider label="List on NEAR Social" hint="Posts to the public #showup feed. ~0.05 NEAR storage, unused part refunded." value={share} onChange={setShare} />
        </Card>
        {status && <Notice text={status} />}
        {error && <Notice tone="red" text={error} />}
        <View style={{ height: 120 }} />
      </Screen>

      {/* Sticky footer */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 14), gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: F.body, fontSize: 14, color: C.muted }}>{share ? 'Contract storage + NEAR Social post' : 'Contract storage'}</Text>
          <Text style={{ fontFamily: F.bodyBold, fontSize: 14, color: C.ink }}>~{fromUnits(cost, 24)} NEAR</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create event"
          accessibilityState={{ busy, disabled: !!startError }}
          disabled={busy || !!startError}
          onPress={create}
          style={({ pressed }) => ({ minHeight: 56, borderRadius: 999, backgroundColor: C.navy, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, opacity: startError ? 0.45 : pressed || busy ? 0.8 : 1 })}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ fontFamily: F.bodyBold, fontSize: 17, color: '#FFFFFF' }}>Create event</Text>}
          {!busy && (
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.coral, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="arrow-right" size={15} color={C.navy} />
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const labelStyle = { fontFamily: F.bodyBold, fontSize: 15, color: C.ink };

function ToggleRow({ label, hint, value, onChange, divider }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void; divider?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: divider ? 1 : 0, borderTopColor: C.line }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: C.ink }}>{label}</Text>
        <Text style={{ fontFamily: F.body, color: C.muted, fontSize: 13, lineHeight: 18 }}>{hint}</Text>
      </View>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: C.accent, false: C.field }} thumbColor="#FFFFFF" {...({ activeThumbColor: "#FFFFFF" } as object)} ios_backgroundColor={C.field} />
    </View>
  );
}
