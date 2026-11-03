import type { Assignment, Branch, Order, Rule } from './types.ts';
import { distanceKm } from './geo.ts';

// geo не отправляет заказ в филиал дальше этого расстояния (ограничение из боевой версии)
export const GEO_LIMIT_KM = 42;

type IsFull = (branchId: string) => boolean;

// Закрепляет заказ за филиалом. isFull говорит, заполнен ли филиал на сутки заказа.
export function assignBranch(
  order: Order,
  branches: Branch[],
  isFull: IsFull = () => false,
): Assignment {
  const own = branches.filter((b) => b.storeId === order.storeId && b.active);

  // manual: решение менеджера, дневной лимит не проверяем
  if (order.manualBranchId) {
    const manual = own.find((b) => b.id === order.manualBranchId);
    if (manual) return make(order, manual.id, 'manual');
  }

  const picked = pickByRules(order, own);

  // ближайший филиал дальше лимита, заказ не распределяем
  if (picked.rule === 'too_far') return make(order, null, 'too_far');
  if (!picked.branch) return make(order, null, 'unassigned');

  // если выбранный филиал заполнен, ищем ближайший незаполненный (правило geo)
  if (!isFull(picked.branch.id)) {
    return make(order, picked.branch.id, picked.rule);
  }

  const free = own.filter((b) => !isFull(b.id));
  const fallback = nearest(order, free);
  if (fallback) return make(order, fallback.branch.id, 'geo');

  return make(order, null, 'unassigned');
}

// Выбор филиала по правилам (без учёта лимита): single, pickup_point, city, geo.
function pickByRules(order: Order, own: Branch[]): { branch: Branch | null; rule: Rule } {
  if (own.length === 1) {
    return { branch: own[0], rule: 'single' };
  }

  if (order.pickupPointId) {
    const byPickup = own.find((b) => b.pickupPointIds.includes(order.pickupPointId as string));
    if (byPickup) return { branch: byPickup, rule: 'pickup_point' };
  }

  const inCity = own.filter((b) => b.city === order.city);
  if (inCity.length === 1) {
    return { branch: inCity[0], rule: 'city' };
  }

  // geo: если в городе несколько филиалов, выбираем из них, иначе из всех
  const pool = inCity.length > 1 ? inCity : own;
  const near = nearest(order, pool);
  if (!near) return { branch: null, rule: 'unassigned' };
  if (near.distance > GEO_LIMIT_KM) return { branch: null, rule: 'too_far' };
  return { branch: near.branch, rule: 'geo' };
}

function nearest(order: Order, branches: Branch[]): { branch: Branch; distance: number } | null {
  if (order.lat === null || order.lon === null) return null;

  let best: { branch: Branch; distance: number } | null = null;
  for (const b of branches) {
    const d = distanceKm(order.lat, order.lon, b.lat, b.lon);
    if (!best || d < best.distance) best = { branch: b, distance: d };
  }
  return best;
}

function make(order: Order, branchId: string | null, rule: Rule): Assignment {
  return { orderId: order.id, branchId, rule };
}
