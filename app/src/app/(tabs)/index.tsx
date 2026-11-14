import { useState } from 'react';
import { router } from 'expo-router';
import { Linking, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useAccount } from '@/context/account';
import { Button, C, Card, F, H2, Link, Logo, Notice, P, Pill, Screen, Ticket, useLoad } from '@/components/kit';
import { view, type Event } from '@/lib/near';
import { EVENT_FEE, NETWORK } from '@/lib/config';
import { fmt, fromUnits, nsToDate, shortId } from '@/lib/units';
import { eventStatus, isUpcoming } from '@/lib/status';
import { getSharedEvents, SOCIAL_WEB } from '@/lib/social';
import { Who, useProfiles } from '@/components/Who';

type Filter = 'all' | 'going' | 'hosting';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All events' },
  { value: 'going', label: 'Going' },
  { value: 'hosting', label: 'Hosting' },
];

export default function Events() {
  const { accountId, balance, balanceLoaded } = useAccount();
  const [filter, setFilter] = useState<Filter>('all');
  const narrow = useWindowDimensions().width < 375;
  const { data, error, reload } = useLoad(() => view<Event[]>('list_events', { from_index: 0, limit: 50 }), [], 30_000);
  const shared = useLoad(() => getSharedEvents().catch(() => []), [], 60_000);
  const hosts = useProfiles((data ?? []).map((e) => e.host));
  const upcomingIds = new Set((data ?? []).filter(isUpcoming).map((e) => e.id));
  const discover = (shared.data ?? []).filter((s) => upcomingIds.has(s.eventId) && s.host !== accountId).slice(0, 5);

  const shown = (data ?? [])
    .filter((e) => filter === 'all' || (filter === 'going' ? !!accountId && e.guests.includes(accountId) : e.host === accountId))
    // upcoming first (soonest first), then the rest (most recent first)
    .sort((a, b) => Number(isUpcoming(b)) - Number(isUpcoming(a)) || (isUpcoming(a) ? Number(a.starts_at) - Number(b.starts_at) : Number(b.starts_at) - Number(a.starts_at)));
  const anyUpcoming = shown.some(isUpcoming);

  return (
    <Screen onRefresh={reload} tabBar>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Logo height={narrow ? 22 : 28} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={balance === null ? 'Add NEAR to your wallet' : `Balance ${fromUnits(balance, 24, 2)} NEAR`}
          onPress={() => router.push('/me')}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, marginLeft: 10, paddingLeft: 14, paddingRight: 6, minHeight: 42, borderRadius: 999, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, opacity: pressed ? 0.7 : 1 })}>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.bodyBold, fontSize: 15, color: C.ink }}>{balance !== null ? `${fromUnits(balance, 24, 2)} NEAR` : balanceLoaded ? 'Add NEAR' : '… NEAR'}</Text>
          {/* Wrapped so the pill centres in the chip (Pill pins itself to the top of rows). */}
          {NETWORK === 'testnet' ? <View style={{ justifyContent: 'center' }}><Pill text="TEST" tone="purple" /></View> : <View style={{ width: 8 }} />}
        </Pressable>
      </View>

      {/* Hero */}
      <View style={{ backgroundColor: C.accent, borderRadius: 26, padding: 22, gap: 14, overflow: 'hidden' }}>
        {/* Decoration stays in the corner, behind and clear of the text. */}
        <View pointerEvents="none" style={{ position: 'absolute', right: -46, top: -46, width: 130, height: 130, borderRadius: 65, backgroundColor: C.coral }} />
        <View pointerEvents="none" style={{ position: 'absolute', right: 14, top: 14, width: 30, height: 30, borderRadius: 15, borderWidth: 3, borderColor: '#FFFFFF' }} />
        <Text accessibilityRole="header" style={{ fontFamily: F.display, fontSize: 32, lineHeight: 35, color: '#FFFFFF', letterSpacing: -1, paddingRight: 64 }}>
          Show up. Get paid back.
        </Text>
        <Text style={{ fontFamily: F.body, fontSize: 15, lineHeight: 21, color: C.onAccentSoft }}>
          Lock a small deposit to RSVP. Come, and you get it back plus a share of what the no-shows left behind.
        </Text>
        <Button variant="white" icon="plus" title="Host" accessibilityLabel="Host an event" onPress={() => router.push('/event/new')} style={{ alignSelf: 'flex-start', borderWidth: 0, paddingHorizontal: 26 }} />
      </View>

      {error && <Notice tone="red" text={`Couldn't load events: ${error}`} />}

      {discover.length > 0 && filter === 'all' && (
        <>
          <H2>Discover on NEAR Social</H2>
          {discover.map((s) => (
            <Pressable key={`${s.host}-${s.eventId}`} accessibilityRole="button" onPress={() => router.push(`/event/${s.eventId}`)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <Card tone="accent">
                <Who account={s.host} profile={hosts[s.host]} size={24} />
                <P>{s.text.split('\n')[0]}</P>
              </Card>
            </Pressable>
          ))}
          <Link title="See #showup on NEAR Social ↗" onPress={() => Linking.openURL(`${SOCIAL_WEB}/?hashtag=showup`)} />
        </>
      )}

      <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 8 }}>
        {FILTERS.map((f) => {
          const on = f.value === filter;
          return (
            <Pressable
              key={f.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setFilter(f.value)}
              style={({ pressed }) => ({ flex: 1, minHeight: 44, paddingHorizontal: 8, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.navy : C.card, borderWidth: 1, borderColor: on ? C.navy : C.line, opacity: pressed ? 0.7 : 1 })}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontFamily: F.bodyBold, fontSize: 15, color: on ? '#FFFFFF' : C.ink }}>{f.value === 'all' && narrow ? 'All' : f.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {!data && !error && <P muted>Loading events…</P>}
      {shown.map((e) => (
        <EventTicket key={e.id} e={e} hostName={hosts[e.host]?.name} />
      ))}
      {data && !anyUpcoming && (
        <Text style={{ fontFamily: F.body, color: C.muted, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 }}>
          {filter === 'going' ? "You haven't RSVPed to anything coming up." : filter === 'hosting' ? "You're not hosting anything coming up." : 'No upcoming events yet.'} Hosting costs {fromUnits(EVENT_FEE, 24)} NEAR — the contract holds guests&apos; money, never you.
        </Text>
      )}
    </Screen>
  );
}

function EventTicket({ e, hostName }: { e: Event; hostName?: string }) {
  const st = eventStatus(e);
  const d = nsToDate(e.starts_at);
  const filled = e.capacity ? Math.min(1, e.guests.length / e.capacity) : 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${e.title}, ${st.text}, ${e.guests.length} of ${e.capacity} going`} onPress={() => router.push(`/event/${e.id}`)} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
      <Ticket
        borderless
        stub={
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text style={{ fontFamily: F.bodyBold, fontSize: 13, letterSpacing: 1, color: C.muted }}>{d.toLocaleString('en', { month: 'short' }).toUpperCase()}</Text>
            <Text style={{ fontFamily: F.display, fontSize: 32, lineHeight: 34, color: C.ink }}>{d.getDate()}</Text>
            <Text style={{ fontFamily: F.monoRegular, fontSize: 12, color: C.muted }}>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</Text>
          </View>
        }>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Pill text={st.text} tone={st.tone === 'accent' ? 'purple' : st.tone} />
          {e.location ? <Text style={{ fontFamily: F.body, color: C.muted, fontSize: 13, flexShrink: 1 }} numberOfLines={1}>{e.location}</Text> : null}
        </View>
        <Text style={{ fontFamily: F.display, fontSize: 19, lineHeight: 23, color: C.ink, textDecorationLine: e.cancelled ? 'line-through' : 'none' }} numberOfLines={2}>
          {e.title}
        </Text>
        <Text style={{ fontFamily: F.monoRegular, fontSize: 12, color: C.muted }} numberOfLines={1}>{hostName ?? shortId(e.host)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
          <Text style={{ fontFamily: F.bodyBold, fontSize: 14, color: C.ink }}>{fmt(e.deposit, e.asset)}</Text>
          <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: C.field, overflow: 'hidden' }}>
            <View style={{ width: `${Math.max(filled * 100, filled > 0 ? 4 : 0)}%`, height: 6, borderRadius: 3, backgroundColor: e.cancelled ? C.muted : C.accent }} />
          </View>
          <Text style={{ fontFamily: F.bodyMedium, fontSize: 13, color: C.muted }}>{e.guests.length}/{e.capacity}</Text>
        </View>
      </Ticket>
    </Pressable>
  );
}
