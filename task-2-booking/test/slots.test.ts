import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSlots } from '../src/slots.ts';
import { overlaps, toMinutes } from '../src/time.ts';
import type { Booking, Master, Service } from '../src/types.ts';

const day = { from: '10:00', to: '13:00', breaks: [] };

const master: Master = {
  id: 'm-1',
  name: 'Тест',
  schedule: { mon: day, tue: day, wed: day, thu: day, fri: day, sat: null, sun: null },
};

const cut: Service = { id: 's-cut', name: 'Стрижка', durationMin: 60, masterIds: ['m-1'] };

const range = (from: string, to: string) => ({ start: toMinutes(from), end: toMinutes(to) });

test('overlaps: пересекающиеся интервалы', () => {
  assert.equal(overlaps(range('10:00', '11:00'), range('10:30', '11:30')), true);
});

test('overlaps: запись сразу после другой не пересекается', () => {
  assert.equal(overlaps(range('10:00', '11:00'), range('11:00', '12:00')), false);
});

test('getSlots: свободный день', () => {
  // 2030-11-18 — понедельник
  const slots = getSlots(master, cut, '2030-11-18', []);
  assert.deepEqual(slots, ['10:00', '10:15', '10:30', '10:45', '11:00', '11:15', '11:30', '11:45', '12:00']);
});

test('getSlots: выходной', () => {
  assert.deepEqual(getSlots(master, cut, '2030-11-23', []), []);
});

const dayWithBreak = { from: '10:00', to: '13:00', breaks: [{ from: '11:00', to: '11:30' }] };
const masterBreak: Master = {
  id: 'm-1',
  name: 'Тест',
  schedule: { mon: dayWithBreak, tue: dayWithBreak, wed: dayWithBreak, thu: dayWithBreak, fri: dayWithBreak, sat: null, sun: null },
};

const booking = (over: Partial<Booking>): Booking => ({
  id: 'bk-x',
  masterId: 'm-1',
  serviceId: 's-cut',
  start: '2030-11-18T05:00:00.000Z', // 10:00 по Алматы
  end: '2030-11-18T06:00:00.000Z', // 11:00 по Алматы
  clientPhone: '+77012345678',
  status: 'active',
  ...over,
});

test('getSlots: слот не пересекает перерыв', () => {
  const slots = getSlots(masterBreak, cut, '2030-11-18', []);
  // перерыв 11:00-11:30: слоты 10:15..11:15 пересекают его и выпадают
  assert.deepEqual(slots, ['10:00', '11:30', '11:45', '12:00']);
});

test('getSlots: занятое время не выдаётся, отменённые записи не мешают', () => {
  const active = getSlots(master, cut, '2030-11-18', [booking({})]);
  // запись 10:00-11:00 плюс 7 минут уборки блокируют начало до 11:15
  assert.equal(active.includes('10:00'), false);
  assert.equal(active.includes('11:00'), false);
  assert.equal(active.includes('11:15'), true);

  const cancelled = getSlots(master, cut, '2030-11-18', [booking({ status: 'cancelled' })]);
  assert.equal(cancelled.includes('10:00'), true);
});

test('getSlots: прошедшее время не выдаётся', () => {
  const prev = process.env.NOW;
  process.env.NOW = '2030-11-18T06:30:00.000Z'; // 11:30 по Алматы
  try {
    const slots = getSlots(master, cut, '2030-11-18', []);
    assert.equal(slots.includes('11:00'), false); // уже прошло
    assert.equal(slots.includes('11:45'), true); // ещё впереди
  } finally {
    if (prev === undefined) delete process.env.NOW;
    else process.env.NOW = prev;
  }
});
