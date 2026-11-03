import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignBranch } from '../src/router.ts';
import { distanceKm } from '../src/geo.ts';
import type { Branch, Order } from '../src/types.ts';

const branch = (over: Partial<Branch>): Branch => ({
  id: 'b-1',
  storeId: 's-1',
  name: 'Филиал',
  city: 'Алматы',
  lat: 43.24,
  lon: 76.91,
  active: true,
  pickupPointIds: [],
  dailyLimit: 100,
  ...over,
});

const order = (over: Partial<Order>): Order => ({
  id: 'o-1',
  storeId: 's-1',
  city: 'Алматы',
  lat: 43.25,
  lon: 76.92,
  pickupPointId: null,
  manualBranchId: null,
  createdAt: '2026-11-16T06:00:00Z',
  ...over,
});

const almaty = branch({ id: 'b-ala', city: 'Алматы', lat: 43.2567, lon: 76.9286 });
const astana = branch({ id: 'b-ast', city: 'Астана', lat: 51.128, lon: 71.43 });

test('distanceKm: Алматы — Астана около 970 км', () => {
  const d = distanceKm(43.2389, 76.8897, 51.1694, 71.4491);
  assert.ok(Math.abs(d - 970) < 15, `получили ${d.toFixed(1)}`);
});

test('manual: заказ уходит в указанный филиал', () => {
  const res = assignBranch(order({ manualBranchId: 'b-ast' }), [almaty, astana]);
  assert.deepEqual(res, { orderId: 'o-1', branchId: 'b-ast', rule: 'manual' });
});

test('manual: неактивный филиал пропускается', () => {
  const closed = { ...astana, active: false };
  const res = assignBranch(order({ manualBranchId: 'b-ast' }), [almaty, closed]);
  assert.notEqual(res.rule, 'manual');
});

test('single: у магазина один активный филиал', () => {
  const res = assignBranch(order({ city: 'Шымкент' }), [almaty]);
  assert.deepEqual(res, { orderId: 'o-1', branchId: 'b-ala', rule: 'single' });
});

test('geo: выбирается ближайший филиал', () => {
  const res = assignBranch(order({ city: 'Конаев', lat: 43.25, lon: 76.93 }), [almaty, astana]);
  assert.deepEqual(res, { orderId: 'o-1', branchId: 'b-ala', rule: 'geo' });
});

test('geo: без координат заказ не распределяется', () => {
  const res = assignBranch(order({ city: 'Конаев', lat: null, lon: null }), [almaty, astana]);
  assert.equal(res.rule, 'unassigned');
});

test('pickup_point: пункт выдачи закреплён за филиалом', () => {
  const withPickup = branch({ id: 'b-pp', pickupPointIds: ['pp-1'] });
  const res = assignBranch(order({ pickupPointId: 'pp-1' }), [withPickup, astana]);
  assert.deepEqual(res, { orderId: 'o-1', branchId: 'b-pp', rule: 'pickup_point' });
});

test('pickup_point уступает manual', () => {
  const withPickup = branch({ id: 'b-pp', pickupPointIds: ['pp-1'] });
  const res = assignBranch(order({ pickupPointId: 'pp-1', manualBranchId: 'b-ast' }), [withPickup, astana]);
  assert.equal(res.rule, 'manual');
});

test('city: в городе заказа один филиал магазина', () => {
  // в Астане один филиал, пункт выдачи не задан — срабатывает city, а не geo
  const res = assignBranch(order({ city: 'Астана', pickupPointId: null }), [almaty, astana]);
  assert.deepEqual(res, { orderId: 'o-1', branchId: 'b-ast', rule: 'city' });
});

test('geo: если в городе несколько филиалов, выбирается ближайший из них', () => {
  const near = branch({ id: 'b-near', city: 'Алматы', lat: 43.251, lon: 76.921 });
  const far = branch({ id: 'b-far', city: 'Алматы', lat: 43.35, lon: 77.1 });
  const res = assignBranch(order({ city: 'Алматы', lat: 43.25, lon: 76.92 }), [near, far]);
  assert.deepEqual(res, { orderId: 'o-1', branchId: 'b-near', rule: 'geo' });
});

test('geo: ближайший филиал дальше 42 км — too_far', () => {
  const a = branch({ id: 'b-a', city: 'Алматы', lat: 43.24, lon: 76.91 });
  const b = branch({ id: 'b-b', city: 'Астана', lat: 51.13, lon: 71.43 });
  // заказ в Таразе, оба филиала далеко, city не сработает
  const res = assignBranch(order({ city: 'Тараз', lat: 42.9, lon: 71.37 }), [a, b]);
  assert.deepEqual(res, { orderId: 'o-1', branchId: null, rule: 'too_far' });
});

test('лимит: заполненный филиал пропускается, заказ уходит в ближайший свободный', () => {
  const full = branch({ id: 'b-full', city: 'Алматы', lat: 43.25, lon: 76.92 });
  const free = branch({ id: 'b-free', city: 'Алматы', lat: 43.26, lon: 76.93 });
  const isFull = (id: string) => id === 'b-full';
  const res = assignBranch(order({ city: 'Алматы', lat: 43.25, lon: 76.92 }), [full, free], isFull);
  assert.deepEqual(res, { orderId: 'o-1', branchId: 'b-free', rule: 'geo' });
});

test('лимит: свободных филиалов нет — unassigned', () => {
  const a = branch({ id: 'b-a', city: 'Алматы', lat: 43.25, lon: 76.92 });
  const b = branch({ id: 'b-b', city: 'Алматы', lat: 43.26, lon: 76.93 });
  const res = assignBranch(order({ city: 'Алматы' }), [a, b], () => true);
  assert.equal(res.rule, 'unassigned');
  assert.equal(res.branchId, null);
});

test('лимит: manual игнорирует заполненность', () => {
  const res = assignBranch(order({ manualBranchId: 'b-ast' }), [almaty, astana], () => true);
  assert.deepEqual(res, { orderId: 'o-1', branchId: 'b-ast', rule: 'manual' });
});
