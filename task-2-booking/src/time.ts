import type { Weekday } from './types.ts';

// Казахстан живёт в одном часовом поясе
export const TZ_OFFSET = '+05:00';

const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// date: 'YYYY-MM-DD'
export function weekday(date: string): Weekday {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

export type Range = { start: number; end: number };

// Интервалы, которые только касаются краями (конец одного = начало другого), не пересекаются
export function overlaps(a: Range, b: Range): boolean {
  return a.start < b.end && b.start < a.end;
}

export function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00${TZ_OFFSET}`));
}
