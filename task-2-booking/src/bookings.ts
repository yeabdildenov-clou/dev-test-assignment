import { randomUUID } from 'node:crypto';
import type { Booking } from './types.ts';
import { now } from './clock.ts';
import { bookingRepo, masters, services } from './store.ts';
import { getSlots } from './slots.ts';

export type Result = { status: number; body: unknown };

export type BookingInput = {
  masterId: string;
  serviceId: string;
  start: string;
  clientPhone: string;
};

const CANCEL_LIMIT_MS = 2 * 60 * 60 * 1000;

// Казахстанский мобильный -> '+77XXXXXXXXX' или null, если номер не подходит
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');

  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  else if (digits.length === 10) digits = `7${digits}`;

  if (digits.length === 11 && digits.startsWith('77')) return `+${digits}`;
  return null;
}

// Защита от одновременного бронирования одного слота в одном процессе
const inFlight = new Set<string>();

export async function createBooking(input: BookingInput): Promise<Result> {
  const master = masters.find((m) => m.id === input.masterId);
  const service = services.find((s) => s.id === input.serviceId);
  if (!master || !service) return { status: 404, body: { error: 'not_found' } };
  if (!service.masterIds.includes(master.id)) return { status: 400, body: { error: 'service_not_offered' } };

  const phone = normalizePhone(input.clientPhone ?? '');
  if (!phone) return { status: 400, body: { error: 'invalid_phone' } };

  const startMs = Date.parse(input.start);
  if (Number.isNaN(startMs)) return { status: 400, body: { error: 'invalid_start' } };

  const date = almatyDate(startMs);
  const time = almatyTime(startMs);
  const key = `${master.id}|${new Date(startMs).toISOString()}`;

  // синхронный захват до первого await: второй параллельный запрос сразу получит 409
  if (inFlight.has(key)) return { status: 409, body: { error: 'slot_unavailable' } };
  inFlight.add(key);
  try {
    const existing = await bookingRepo.listByMaster(master.id);
    const free = getSlots(master, service, date, existing);
    if (!free.includes(time)) return { status: 409, body: { error: 'slot_unavailable' } };

    const booking: Booking = {
      id: `bk-${randomUUID().slice(0, 8)}`,
      masterId: master.id,
      serviceId: service.id,
      start: new Date(startMs).toISOString(),
      end: new Date(startMs + service.durationMin * 60000).toISOString(),
      clientPhone: phone,
      status: 'active',
    };
    await bookingRepo.insert(booking);
    return { status: 201, body: booking };
  } finally {
    inFlight.delete(key);
  }
}

export async function cancelBooking(id: string): Promise<Result> {
  const booking = await bookingRepo.get(id);
  if (!booking) return { status: 404, body: { error: 'not_found' } };

  // повторная отмена не ошибка
  if (booking.status === 'cancelled') return { status: 200, body: booking };

  if (Date.parse(booking.start) - now().getTime() < CANCEL_LIMIT_MS) {
    return { status: 409, body: { error: 'too_late' } };
  }

  await bookingRepo.update(id, { status: 'cancelled' });
  const updated = await bookingRepo.get(id);
  return { status: 200, body: updated };
}

const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000;

function almatyDate(ms: number): string {
  return new Date(ms + ALMATY_OFFSET_MS).toISOString().slice(0, 10);
}

function almatyTime(ms: number): string {
  return new Date(ms + ALMATY_OFFSET_MS).toISOString().slice(11, 16);
}
