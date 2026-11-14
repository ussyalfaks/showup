// Start time for a new event: a calendar date, an hour (1-12 + AM/PM) and minutes in
// 15-minute steps. All in the phone's local time zone.

export const MINUTES = [0, 15, 30, 45] as const;
/** The contract needs the start at least 10 minutes away. */
export const MIN_LEAD_MS = 10 * 60_000;
/** Check-in opens this long before the start (contract constant EARLY_CHECKIN_NS). */
export const EARLY_CHECKIN_MS = 2 * 3600_000;

/** Next quarter hour at or after `d` (seconds dropped). */
export function roundUpToQuarter(d: Date): Date {
  const r = new Date(d);
  r.setSeconds(0, 0);
  const extra = (15 - (r.getMinutes() % 15)) % 15;
  r.setMinutes(r.getMinutes() + extra);
  return r;
}

export function at(now: Date, daysAhead: number, h: number, m = 0): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + daysAhead);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Same calendar minute? Used to highlight the preset that matches the fields. */
export const sameMinute = (a: Date, b: Date) => Math.floor(a.getTime() / 60_000) === Math.floor(b.getTime() / 60_000);

/** Quick picks. "In 15 min" rounds up to the next quarter hour, so it fits the minute steps. */
export function startPresets(now = new Date()): { label: string; date: Date }[] {
  const soon = roundUpToQuarter(new Date(now.getTime() + 15 * 60_000));
  const tonight = at(now, 0, 19);
  const saturday = at(now, 0, 14);
  saturday.setDate(saturday.getDate() + ((6 - saturday.getDay() + 7) % 7 || 7));
  return [
    { label: 'In 15 min', date: soon },
    ...(tonight.getTime() >= now.getTime() + MIN_LEAD_MS ? [{ label: 'Tonight 7 PM', date: tonight }] : []),
    { label: 'Tomorrow 6 PM', date: at(now, 1, 18) },
    { label: 'Saturday 2 PM', date: saturday },
  ];
}

/** 0-23 -> { hour: 1-12, pm } */
export function to12h(h24: number): { hour: number; pm: boolean } {
  return { hour: h24 % 12 === 0 ? 12 : h24 % 12, pm: h24 >= 12 };
}

/** 1-12 + AM/PM -> 0-23 (12 AM is midnight, 12 PM is noon). */
export function from12h(hour: number, pm: boolean): number {
  return (hour % 12) + (pm ? 12 : 0);
}

/** Copy of `d` with a new time of day. */
export function withTime(d: Date, hour12: number, minute: number, pm: boolean): Date {
  const r = new Date(d);
  r.setHours(from12h(hour12, pm), minute, 0, 0);
  return r;
}

/** Copy of `d` moved to another calendar day, keeping the time of day. */
export function withDay(d: Date, day: Date): Date {
  const r = new Date(day);
  r.setHours(d.getHours(), d.getMinutes(), 0, 0);
  return r;
}

/** Problem with the chosen start, or null if it's fine. */
export function startProblem(start: Date, now = new Date()): string | null {
  if (start.getTime() < now.getTime() + MIN_LEAD_MS) return 'Pick a start at least 10 minutes from now.';
  return null;
}

export const fmtTime = (d: Date) => d.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit', hour12: true });
export const fmtDate = (d: Date) => d.toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** "Check-in opens 4:00 PM and closes 7:30 PM", with the day when it isn't the start day. */
export function checkinSummary(start: Date, checkinMinutes: number): string {
  const opens = new Date(start.getTime() - EARLY_CHECKIN_MS);
  const closes = new Date(start.getTime() + checkinMinutes * 60_000);
  const day = (d: Date) => (d.toDateString() === start.toDateString() ? '' : ` (${d.toLocaleDateString('en', { weekday: 'short' })})`);
  return `Check-in opens ${fmtTime(opens)}${day(opens)} and closes ${fmtTime(closes)}${day(closes)}.`;
}

/** Short name of the phone's time zone, e.g. "WAT" or "GMT+1". */
export function zoneName(d = new Date()): string {
  const part = new Intl.DateTimeFormat('en', { timeZoneName: 'short' }).formatToParts(d).find((p) => p.type === 'timeZoneName');
  return part?.value ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}
