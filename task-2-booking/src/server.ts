import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { bookingRepo, masters, services } from './store.ts';
import { isValidDate } from './time.ts';
import { getSlots } from './slots.ts';
import { cancelBooking, createBooking, type BookingInput } from './bookings.ts';

const port = Number(process.env.PORT ?? 3002);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);

  try {
    if (req.method === 'GET' && url.pathname === '/masters') {
      return send(res, 200, masters);
    }

    if (req.method === 'GET' && url.pathname === '/services') {
      return send(res, 200, services);
    }

    // GET /masters/:id/slots?serviceId=&date=
    if (req.method === 'GET' && parts[0] === 'masters' && parts[2] === 'slots' && parts.length === 3) {
      const serviceId = url.searchParams.get('serviceId');
      const date = url.searchParams.get('date');
      if (!serviceId || !date || !isValidDate(date)) return send(res, 400, { error: 'bad_request' });

      const master = masters.find((m) => m.id === parts[1]);
      const service = services.find((s) => s.id === serviceId);
      if (!master || !service) return send(res, 404, { error: 'not_found' });
      if (!service.masterIds.includes(master.id)) return send(res, 400, { error: 'service_not_offered' });

      const bookings = await bookingRepo.listByMaster(master.id);
      const slots = getSlots(master, service, date, bookings);
      return send(res, 200, { masterId: master.id, serviceId: service.id, date, slots });
    }

    // POST /bookings
    if (req.method === 'POST' && url.pathname === '/bookings') {
      const body = (await readJson(req)) as Partial<BookingInput> | null;
      if (!body || !body.masterId || !body.serviceId || !body.start || !body.clientPhone) {
        return send(res, 400, { error: 'bad_request' });
      }
      const result = await createBooking(body as BookingInput);
      return send(res, result.status, result.body);
    }

    // DELETE /bookings/:id
    if (req.method === 'DELETE' && parts[0] === 'bookings' && parts.length === 2) {
      const result = await cancelBooking(parts[1]);
      return send(res, result.status, result.body);
    }

    send(res, 404, { error: 'not_found' });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: 'internal' });
  }
});

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : null;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

server.listen(port, () => {
  console.log(`booking: http://localhost:${port}`);
});
