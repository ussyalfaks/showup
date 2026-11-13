import type { Event } from './near';

export function eventStatus(e: Event): { text: string; tone: 'muted' | 'accent' | 'green' | 'red' } {
  const now = Date.now() * 1e6;
  if (e.cancelled) return { text: 'cancelled', tone: 'red' };
  if (e.settled) return { text: 'settled', tone: 'muted' };
  if (now > Number(e.checkin_until)) return { text: 'ready to settle', tone: 'accent' };
  if (now >= Number(e.starts_at) - 2 * 3600e9) return { text: 'check-in open', tone: 'green' };
  return { text: 'RSVPs open', tone: 'accent' };
}
