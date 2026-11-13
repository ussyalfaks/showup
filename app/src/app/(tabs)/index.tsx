import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Button, C, Card, H1, H2, Link, Notice, P, Pill, Row, Screen, useLoad } from '@/components/kit';
import { view, type Event } from '@/lib/near';
import { fmt, nsToDate } from '@/lib/units';
import { eventStatus } from '@/lib/status';
import { getSharedEvents, SOCIAL_WEB } from '@/lib/social';
import { Who, useProfiles } from '@/components/Who';
import { Linking } from 'react-native';

export default function Events() {
  const { data, error, reload } = useLoad(() => view<Event[]>('list_events', { from_index: 0, limit: 50 }), [], 15_000);
  const shared = useLoad(() => getSharedEvents().catch(() => []), [], 30_000);
  const hosts = useProfiles((data ?? []).map((e) => e.host));
  const upcoming = new Set((data ?? []).filter((e) => !e.settled && !e.cancelled).map((e) => e.id));
  const discover = (shared.data ?? []).filter((s) => upcoming.has(s.eventId)).slice(0, 5);

  return (
    <Screen onRefresh={reload}>
      <H1>ShowUp</H1>
      <P muted>Lock a small deposit to RSVP. Show up and get it back — plus a share of what the no-shows left behind.</P>
      <Button title="+ Host an event" onPress={() => router.push('/event/new')} />

      {error && <Notice tone="red" text={`Couldn't load events: ${error}`} />}
      {discover.length > 0 && (
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
      <H2>Events</H2>
      {data && !data.length && <P muted>No events yet. Host the first one.</P>}
      {data?.map((e) => {
        const st = eventStatus(e);
        return (
          <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={`${e.title}, ${st.text}`} onPress={() => router.push(`/event/${e.id}`)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <Card>
              <Row>
                <Pill text={st.text} tone={st.tone} />
                <Text style={{ color: C.muted, fontSize: 14 }}>{nsToDate(e.starts_at).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
              </Row>
              <Text style={{ fontSize: 20, fontWeight: '800', color: C.ink }}>{e.title}</Text>
              <Who account={e.host} profile={hosts[e.host]} size={20} />
              {e.location ? <P muted small>{e.location}</P> : null}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <P small>Deposit {fmt(e.deposit, e.asset)}</P>
                <P small muted>{e.guests.length}/{e.capacity} going{e.settled ? ` · ${e.attended} came` : ''}</P>
              </View>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
