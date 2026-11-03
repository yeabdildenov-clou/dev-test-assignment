import { createServer, type ServerResponse } from 'node:http';
import { assignments, branches, orders } from './store.ts';
import { assignBranch } from './router.ts';
import { almatyDate, isValidDate } from './time.ts';

const port = Number(process.env.PORT ?? 3001);

// Сколько заказов уже закреплено за филиалом за сутки (по Алматы)
function countAssigned(branchId: string, date: string): number {
  let n = 0;
  for (const [orderId, a] of assignments) {
    if (a.branchId !== branchId) continue;
    const order = orders.find((o) => o.id === orderId);
    if (order && almatyDate(order.createdAt) === date) n += 1;
  }
  return n;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);

  try {
    if (req.method === 'GET' && url.pathname === '/branches') {
      return send(res, 200, branches);
    }

    // GET /branches/:id/load?date=YYYY-MM-DD
    if (req.method === 'GET' && parts[0] === 'branches' && parts[2] === 'load' && parts.length === 3) {
      const date = url.searchParams.get('date');
      if (!date || !isValidDate(date)) return send(res, 400, { error: 'bad_date' });
      const branch = branches.find((b) => b.id === parts[1]);
      if (!branch) return send(res, 404, { error: 'branch_not_found' });
      const assigned = countAssigned(branch.id, date);
      return send(res, 200, { branchId: branch.id, date, assigned, limit: branch.dailyLimit });
    }

    // POST /orders/:id/assign
    if (req.method === 'POST' && parts[0] === 'orders' && parts[2] === 'assign' && parts.length === 3) {
      const order = orders.find((o) => o.id === parts[1]);
      if (!order) return send(res, 404, { error: 'order_not_found' });

      // идемпотентность: повторный вызов возвращает то же решение и не занимает лимит снова
      const existing = assignments.get(order.id);
      if (existing) return send(res, 200, existing);

      const day = almatyDate(order.createdAt);
      const isFull = (branchId: string): boolean => {
        const branch = branches.find((b) => b.id === branchId);
        if (!branch) return false;
        return countAssigned(branchId, day) >= branch.dailyLimit;
      };

      const assignment = assignBranch(order, branches, isFull);
      assignments.set(order.id, assignment);
      return send(res, 200, assignment);
    }

    if (req.method === 'GET' && parts[0] === 'orders' && parts.length === 2) {
      const order = orders.find((o) => o.id === parts[1]);
      if (!order) return send(res, 404, { error: 'order_not_found' });
      return send(res, 200, order);
    }

    send(res, 404, { error: 'not_found' });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: 'internal' });
  }
});

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

server.listen(port, () => {
  console.log(`dispatch: http://localhost:${port}`);
});
