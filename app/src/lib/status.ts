import type { Event } from './near';

export function eventStatus(e: Event): { text: string; tone: 'muted' | 'accent' | 'green' | 'red' | 'amber' } {
  const now = Date.now() * 1e6;
  if (e.cancelled) return { text: 'Cancelled', tone: 'red' };
  if (e.settled) return { text: 'Settled', tone: 'muted' };
  if (now > Number(e.checkin_until)) return { text: 'Ready to settle', tone: 'amber' };
  if (now >= Number(e.starts_at) - 2 * 3600e9) return { text: 'Check-in open', tone: 'green' };
  return { text: 'RSVPs open', tone: 'accent' };
}

/** Still ahead or happening: not cancelled, not settled, check-in not closed. */
export const isUpcoming = (e: Event) => !e.cancelled && !e.settled && Date.now() * 1e6 <= Number(e.checkin_until);
