import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBooking, normalizePhone } from '../src/bookings.ts';

test('normalizePhone: разные форматы приводятся к +77XXXXXXXXX', () => {
  assert.equal(normalizePhone('+7 701 234 56 78'), '+77012345678');
  assert.equal(normalizePhone('87012345678'), '+77012345678');
  assert.equal(normalizePhone('8 (701) 234-56-78'), '+77012345678');
  assert.equal(normalizePhone('7012345678'), '+77012345678');
});

test('normalizePhone: мусор отклоняется', () => {
  assert.equal(normalizePhone('123'), null);
  assert.equal(normalizePhone('+1 202 555 0147'), null);
  assert.equal(normalizePhone(''), null);
});

test('createBooking: два одновременных запроса на один слот, только одна запись', async () => {
  // свободный будущий слот у мастера m-1 (услуга s-cut, 60 мин), 15:00 по Алматы
  const input = {
    masterId: 'm-1',
    serviceId: 's-cut',
    start: '2030-11-18T15:00:00+05:00',
    clientPhone: '+7 701 000 00 00',
  };

  const [a, b] = await Promise.all([createBooking(input), createBooking({ ...input })]);
  const statuses = [a.status, b.status].sort();

  assert.deepEqual(statuses, [201, 409]);
  const conflict = [a, b].find((r) => r.status === 409);
  assert.deepEqual(conflict?.body, { error: 'slot_unavailable' });
});

test('createBooking: мастер не оказывает услугу, 400', async () => {
  const res = await createBooking({
    masterId: 'm-1',
    serviceId: 's-mani', // маникюр делает только m-2
    start: '2030-11-19T15:00:00+05:00',
    clientPhone: '+77010000000',
  });
  assert.equal(res.status, 400);
});
