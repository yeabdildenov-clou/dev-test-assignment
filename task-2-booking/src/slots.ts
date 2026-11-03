import type { Booking, Master, Service } from './types.ts';
import { TZ_OFFSET, fromMinutes, overlaps, toMinutes, weekday } from './time.ts';
import { now } from './clock.ts';

export const SLOT_STEP_MIN = 15;
// После каждой записи у мастера технический перерыв на уборку места
export const CLEANUP_MIN = 7;

// Свободные слоты мастера на дату, 'HH:mm' по Алматы
export function getSlots(master: Master, service: Service, date: string, bookings: Booking[]): string[] {
  const day = master.schedule[weekday(date)];
  if (!day) return [];

  const open = toMinutes(day.from);
  const close = toMinutes(day.to);
  const duration = service.durationMin;

  const breaks = day.breaks.map((b) => ({ start: toMinutes(b.from), end: toMinutes(b.to) }));

  // Активные записи занимают своё время плюс технический перерыв после них
  const busy = bookings
    .filter((b) => b.status === 'active')
    .map((b) => ({
      start: minutesOfDay(b.start, date),
      end: minutesOfDay(b.end, date) + CLEANUP_MIN,
    }));

  const nowMs = now().getTime();
  const result: string[] = [];

  for (let start = open; start + duration <= close; start += SLOT_STEP_MIN) {
    const slot = { start, end: start + duration };

    if (breaks.some((b) => overlaps(slot, b))) continue;
    if (busy.some((b) => overlaps(slot, b))) continue;
    if (instant(date, start) <= nowMs) continue; // слот должен начинаться позже текущего момента

    result.push(fromMinutes(start));
  }

  return result;
}

// Минуты от полуночи по Алматы для ISO-времени (UTC) на заданную дату
function minutesOfDay(iso: string, date: string): number {
  const midnight = Date.parse(`${date}T00:00:00${TZ_OFFSET}`);
  return (Date.parse(iso) - midnight) / 60000;
}

// Момент времени (мс) для слота date + minutes по Алматы
function instant(date: string, minutes: number): number {
  return Date.parse(`${date}T00:00:00${TZ_OFFSET}`) + minutes * 60000;
}
