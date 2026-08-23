import { describe, it, expect, vi } from 'vitest';
import { Broadcaster, makeEventMessage, parseTenantId } from '../src/durable/broadcaster.js';
import ordersRoutes, { broadcastNewBooking } from '../src/api/orders.js';
import { mountRouter } from './helpers/routerHarness.js';
import { generateToken } from '../src/middleware/sharedAuth.js';

import app from '../src/index.js';

const ordersApp = mountRouter(ordersRoutes, { tenantId: 't1', basePath: '/api/orders' });

const SECRET = 'test-secret';

function makeDbMock() {
  const chain = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [] }),
    run: vi.fn().mockResolvedValue({ success: true }),
  };
  const db = { prepare: vi.fn().mockReturnValue(chain) };
  return { db, chain };
}

function makeRequest(method, url, body = null, headers = {}) {
  const opts = { method, headers: new Headers({ ...headers }) };
  if (body) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

function chainMock(fns) {
  let idx = 0;
  return () => {
    const ch = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    };
    if (idx < fns.length) fns[idx](ch, idx);
    idx++;
    return ch;
  };
}

function makeEnv(overrides = {}) {
  return {
    DB: {
      // Phase 1: requireAuth re-validates is_active on every authenticated
      // request via 'SELECT is_active FROM admins WHERE id = ?'. Answer it
      // with an active row so happy-path tests exercise the SSE logic.
      prepare: vi.fn((sql) => {
        if (sql.includes('SELECT is_active FROM admins')) {
          return {
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ results: [{ is_active: 1 }] }),
            first: vi.fn().mockResolvedValue({ is_active: 1 }),
            run: vi.fn().mockResolvedValue({}),
          };
        }
        return {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({}),
        };
      }),
    },
    JWT_SECRET: SECRET,
    ENVIRONMENT: 'test',
    ...overrides,
  };
}

async function makeToken(overrides = {}) {
  return await generateToken(
    { sub: 'u1', userId: 'u1', email: 'a@b.com', role: 'admin', tenantId: 't1', ...overrides },
    SECRET,
    'access'
  );
}

describe('Broadcaster pure helpers', () => {
  describe('makeEventMessage', () => {
    it('formats a JSON event into an SSE data frame', () => {
      const msg = makeEventMessage({ type: 'connected' });
      expect(msg).toBe('data: {"type":"connected"}\n\n');
    });

    it('contains the full payload including nested fields', () => {
      const msg = makeEventMessage({ type: 'new-booking', orderId: 'ord_1', checkIn: '2030-08-01' });
      expect(msg).toContain('data: ');
      expect(msg).toContain('"type":"new-booking"');
      expect(msg).toContain('"orderId":"ord_1"');
      expect(msg).toContain('"checkIn":"2030-08-01"');
      expect(msg.endsWith('\n\n')).toBe(true);
    });

    it('escapes newlines so the frame stays a single data line', () => {
      const msg = makeEventMessage({ note: 'line1\nline2' });
      expect(msg).toContain('\\n');
      expect(msg.split('\n')).toHaveLength(3);
    });
  });

  describe('parseTenantId', () => {
    it('returns the trimmed id for a valid string', () => {
      expect(parseTenantId('t1')).toBe('t1');
      expect(parseTenantId('  t1  ')).toBe('t1');
    });

    it('returns null for missing or non-string values', () => {
      expect(parseTenantId('')).toBe(null);
      expect(parseTenantId('   ')).toBe(null);
      expect(parseTenantId(undefined)).toBe(null);
      expect(parseTenantId(null)).toBe(null);
      expect(parseTenantId(42)).toBe(null);
    });

    it('returns null for oversized values', () => {
      expect(parseTenantId('x'.repeat(129))).toBe(null);
    });
  });
});

describe('Broadcaster DO routing', () => {
  function makeBroadcaster() {
    const ctx = { waitUntil: vi.fn() };
    const storage = { setAlarm: vi.fn() };
    const b = new Broadcaster({ ctx, storage }, {});
    return { b, ctx, storage };
  }

  it('rejects POST /broadcast with invalid JSON', async () => {
    const { b } = makeBroadcaster();
    const res = await b.fetch(new Request('http://broadcaster/broadcast', { method: 'POST', body: '{not json' }));
    expect(res.status).toBe(400);
  });

  it('rejects POST /broadcast without tenantId', async () => {
    const { b } = makeBroadcaster();
    const res = await b.fetch(new Request('http://broadcaster/broadcast', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(400);
  });

  it('rejects POST /broadcast without an event', async () => {
    const { b } = makeBroadcaster();
    const res = await b.fetch(new Request('http://broadcaster/broadcast', {
      method: 'POST',
      body: JSON.stringify({ tenantId: 't1' }),
    }));
    expect(res.status).toBe(400);
  });

  it('returns ok with 0 delivered when no subscribers', async () => {
    const { b } = makeBroadcaster();
    const res = await b.fetch(new Request('http://broadcaster/broadcast', {
      method: 'POST',
      body: JSON.stringify({ tenantId: 't1', event: { type: 'new-booking' } }),
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, delivered: 0 });
  });

  it('rejects GET /connect without tenantId', async () => {
    const { b } = makeBroadcaster();
    const res = await b.fetch(new Request('http://broadcaster/connect', { method: 'GET' }));
    expect(res.status).toBe(400);
  });

  it('opens an SSE stream with the connected event and correct headers', async () => {
    const { b } = makeBroadcaster();
    const res = await b.fetch(new Request('http://broadcaster/connect?tenantId=t1', { method: 'GET' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const reader = res.body.getReader();
    const { value, done } = await reader.read();
    expect(done).toBe(false);
    expect(new TextDecoder().decode(value)).toContain('"type":"connected"');
    await reader.cancel();
  });

  it('fans a broadcast out to live subscribers of the same tenant', async () => {
    const { b } = makeBroadcaster();
    const reader1 = (await b.fetch(new Request('http://broadcaster/connect?tenantId=t1', { method: 'GET' }))).body.getReader();
    const reader2 = (await b.fetch(new Request('http://broadcaster/connect?tenantId=t1', { method: 'GET' }))).body.getReader();
    await reader1.read();
    await reader2.read();

    const res = await b.fetch(new Request('http://broadcaster/broadcast', {
      method: 'POST',
      body: JSON.stringify({ tenantId: 't1', event: { type: 'new-booking', orderId: 'o1' } }),
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, delivered: 2 });

    const m1 = new TextDecoder().decode((await reader1.read()).value);
    const m2 = new TextDecoder().decode((await reader2.read()).value);
    expect(m1).toContain('"type":"new-booking"');
    expect(m1).toContain('"orderId":"o1"');
    expect(m2).toContain('"type":"new-booking"');
    await reader1.cancel();
    await reader2.cancel();
  });

  it('does not leak events across tenants', async () => {
    const { b } = makeBroadcaster();
    const reader = (await b.fetch(new Request('http://broadcaster/connect?tenantId=t1', { method: 'GET' }))).body.getReader();
    await reader.read();

    const res = await b.fetch(new Request('http://broadcaster/broadcast', {
      method: 'POST',
      body: JSON.stringify({ tenantId: 'other', event: { type: 'new-booking', orderId: 'x' } }),
    }));
    expect(await res.json()).toEqual({ ok: true, delivered: 0 });

    // Promise-race: a delivered broadcast would resolve this with a frame.
    const next = await Promise.race([
      reader.read().then(({ value }) => ({ framed: value !== undefined })),
      new Promise((r) => setTimeout(() => r({ framed: false }), 20)),
    ]);
    expect(next.framed).toBe(false);
    await reader.cancel();
  });

  it('returns 404 for unknown DO paths', async () => {
    const { b } = makeBroadcaster();
    const res = await b.fetch(new Request('http://broadcaster/nope', { method: 'GET' }));
    expect(res.status).toBe(404);
  });

  it('cancel handler removes the connection and clears the interval', async () => {
    const { b } = makeBroadcaster();
    const res = await b.fetch(new Request('http://broadcaster/connect?tenantId=t1', { method: 'GET' }));
    const reader = res.body.getReader();
    await reader.read();

    expect(b.channels.get('t1').size).toBe(1);
    await reader.cancel();

    expect(b.channels.has('t1')).toBe(false);
  });

  it('removeConnection is idempotent when called twice on the same conn', async () => {
    const { b } = makeBroadcaster();
    const res = await b.fetch(new Request('http://broadcaster/connect?tenantId=t1', { method: 'GET' }));
    const reader = res.body.getReader();
    await reader.read();

    const conn = b.channels.get('t1').values().next().value;
    b.removeConnection('t1', conn);
    expect(b.channels.has('t1')).toBe(false);

    expect(() => b.removeConnection('t1', conn)).not.toThrow();
  });

  it('removeConnection is a no-op when conn is null', async () => {
    const { b } = makeBroadcaster();
    expect(() => b.removeConnection('t1', null)).not.toThrow();
  });

  it('deletes the tenant from channels when the last cancelled conn is removed during broadcast', async () => {
    const { b } = makeBroadcaster();
    const res = await b.fetch(new Request('http://broadcaster/connect?tenantId=t1', { method: 'GET' }));
    const reader = res.body.getReader();
    await reader.read();

    const conn = b.channels.get('t1').values().next().value;
    conn.cancelled = true;

    const bcRes = await b.fetch(new Request('http://broadcaster/broadcast', {
      method: 'POST',
      body: JSON.stringify({ tenantId: 't1', event: { type: 'test' } }),
    }));
    expect((await bcRes.json()).delivered).toBe(0);
    expect(b.channels.has('t1')).toBe(false);
    await reader.cancel();
  });

  it('broadcast removes a connection whose controller.enqueue throws', async () => {
    const { b } = makeBroadcaster();
    const throwingController = {
      enqueue: vi.fn(() => { throw new Error('stream closed'); }),
    };
    const conn = {
      controller: throwingController,
      interval: null,
      cancelled: false,
      tenantId: 't1',
    };
    b.getOrCreateSet('t1').add(conn);

    const res = await b.fetch(new Request('http://broadcaster/broadcast', {
      method: 'POST',
      body: JSON.stringify({ tenantId: 't1', event: { type: 'test' } }),
    }));
    const body = await res.json();
    expect(body.delivered).toBe(0);
    expect(conn.cancelled).toBe(true);
    expect(b.channels.has('t1')).toBe(false);
  });

  it('heartbeat skips when conn is already cancelled', async () => {
    vi.useFakeTimers();
    try {
      const { b } = makeBroadcaster();
      const res = await b.fetch(new Request('http://broadcaster/connect?tenantId=t1', { method: 'GET' }));
      const reader = res.body.getReader();
      await reader.read();

      const conn = b.channels.get('t1').values().next().value;
      conn.cancelled = true;
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

      vi.advanceTimersByTime(25000);
      expect(clearIntervalSpy).toHaveBeenCalled();
      await reader.cancel();
      clearIntervalSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('evicts oldest connections when the per-tenant cap is reached', async () => {
    const { b } = makeBroadcaster();
    const fakeConns = [];
    for (let i = 0; i < 100; i++) {
      const conn = { controller: { enqueue: vi.fn() }, interval: null, cancelled: false, tenantId: 't1' };
      b.getOrCreateSet('t1').add(conn);
      fakeConns.push(conn);
    }
    expect(b.channels.get('t1').size).toBe(100);

    const res = await b.fetch(new Request('http://broadcaster/connect?tenantId=t1', { method: 'GET' }));
    const reader = res.body.getReader();
    await reader.read();

    expect(b.channels.get('t1').size).toBe(100);
    expect(fakeConns[0].cancelled).toBe(true);
    await reader.cancel();
  });

  it('heartbeat catch branch removes the connection when enqueue throws', async () => {
    vi.useFakeTimers();
    try {
      const { b } = makeBroadcaster();
      const res = await b.fetch(new Request('http://broadcaster/connect?tenantId=t1', { method: 'GET' }));
      const reader = res.body.getReader();
      await reader.read();

      const conn = b.channels.get('t1').values().next().value;
      const originalEnqueue = conn.controller.enqueue;
      let callCount = 0;
      conn.controller.enqueue = vi.fn((data) => {
        callCount++;
        if (callCount === 2) throw new Error('enqueue failed');
        return originalEnqueue.call(conn.controller, data);
      });

      vi.advanceTimersByTime(25000);
      await vi.runAllTimersAsync();

      expect(b.channels.has('t1')).toBe(false);
      await reader.cancel();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('broadcastNewBooking (orders.js hook)', () => {
  function makeBroadcasterStub() {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    return {
      broadcaster: {
        idFromName: vi.fn().mockReturnValue('id-t1'),
        get: vi.fn().mockReturnValue({ fetch: fetchSpy }),
      },
      fetchSpy,
    };
  }

  it('posts the new-booking payload to the tenant DO after order create', async () => {
    const { broadcaster, fetchSpy } = makeBroadcasterStub();
    broadcastNewBooking({ BROADCASTER: broadcaster }, 't1', {
      id: 'ord_1', camp_id: 'c1', check_in_date: '2030-08-01', check_out_date: '2030-08-05',
    });
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://broadcaster/broadcast');
    expect(broadcaster.idFromName).toHaveBeenCalledWith('t1');
    expect(broadcaster.get).toHaveBeenCalledWith('id-t1');
    const body = JSON.parse(opts.body);
    expect(body.tenantId).toBe('t1');
    expect(body.event).toEqual({
      type: 'new-booking',
      orderId: 'ord_1',
      campId: 'c1',
      checkIn: '2030-08-01',
      checkOut: '2030-08-05',
    });
  });

  it('is a no-op when the BROADCASTER binding is absent', async () => {
    expect(() => broadcastNewBooking({}, 't1', { id: 'o1' })).not.toThrow();
  });

  it('swallows errors when the DO stub throws', async () => {
    const broadcaster = {
      idFromName: vi.fn(() => { throw new Error('boom'); }),
    };
    expect(() => broadcastNewBooking({ BROADCASTER: broadcaster }, 't1', { id: 'o1' })).not.toThrow();
  });

  it('swallows a rejected fetch (broadcast never fails the order)', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('hub down'));
    const broadcaster = {
      idFromName: vi.fn().mockReturnValue('id-t1'),
      get: vi.fn().mockReturnValue({ fetch: fetchSpy }),
    };
    broadcastNewBooking({ BROADCASTER: broadcaster }, 't1', { id: 'o1' });
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    // The rejection must be swallowed — allow microtasks to settle.
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('fires the broadcast from POST /orders after a successful insert', async () => {
    const { db } = makeDbMock();
    const fn = chainMock([
      (ch) => { ch.all.mockResolvedValue({ results: [{ max_guests: 4, base_price: 100 }] }); },
      (ch) => { ch.all.mockResolvedValue({ results: [] }); },
      (ch) => { ch.all.mockResolvedValue({ results: [] }); },
      (ch) => { ch.all.mockResolvedValue({ results: [] }); },
      (ch) => { ch.run.mockResolvedValue({}); },
      (ch) => { ch.run.mockResolvedValue({}); },
    ]);
    db.prepare.mockImplementation(fn);

    const fetchSpy = vi.fn().mockResolvedValue(new Response('ok'));
    const broadcaster = {
      idFromName: vi.fn().mockReturnValue('id-t1'),
      get: vi.fn().mockReturnValue({ fetch: fetchSpy }),
    };

    const req = makeRequest('POST', 'https://x.com/api/orders', {
      camp_id: 'c1', room_id: 'r1', guest_name: 'John Doe',
      guest_email: 'john@test.com', guest_phone: '12345',
      check_in_date: '2030-08-01', check_out_date: '2030-08-05',
    });
    const reqUrl = new URL(req.url);
    const bodyStr = JSON.stringify(await req.json());
    const res = await ordersApp.request(reqUrl.pathname + reqUrl.search, {
      method: req.method,
      headers: req.headers,
      ...(bodyStr ? { body: bodyStr } : {}),
    }, { DB: db, BROADCASTER: broadcaster });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://broadcaster/broadcast');
    const parsed = JSON.parse(opts.body);
    expect(parsed.tenantId).toBe('t1');
    expect(parsed.event.type).toBe('new-booking');
    expect(parsed.event.orderId).toBe(body.id);
    expect(parsed.event.campId).toBe('c1');
    expect(parsed.event.checkIn).toBe('2030-08-01');
    expect(parsed.event.checkOut).toBe('2030-08-05');
  });
});

describe('GET /api/stream/orders (worker route)', () => {
  const SSE_URL = 'https://sinaicamps.com/api/stream/orders?tenantId=t1';

  it('returns 400 when tenantId query param is missing', async () => {
    const res = await app.fetch(new Request('https://sinaicamps.com/api/stream/orders', { method: 'GET' }), makeEnv());
    expect(res.status).toBe(400);
  });

  it('returns 401 without an Authorization header', async () => {
    const res = await app.fetch(new Request(SSE_URL, { method: 'GET' }), makeEnv());
    expect(res.status).toBe(401);
  });

  it('returns 401 without a header token or a token query param', async () => {
    const res = await app.fetch(new Request(SSE_URL, { method: 'GET' }), makeEnv());
    expect(res.status).toBe(401);
  });

  it('accepts the token from the token query param when the Authorization header is absent', async () => {
    const fakeSse = new Response('data: {"type":"connected"}\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
    const stubFetch = vi.fn().mockResolvedValue(fakeSse);
    const broadcaster = {
      idFromName: vi.fn().mockReturnValue('id-t1'),
      get: vi.fn().mockReturnValue({ fetch: stubFetch }),
    };
    const token = await makeToken({ role: 'admin', tenantId: 't1' });
    const res = await app.fetch(new Request(`${SSE_URL}&token=${token}`, { method: 'GET' }), makeEnv({ BROADCASTER: broadcaster }));

    expect(broadcaster.idFromName).toHaveBeenCalledWith('t1');
    expect(broadcaster.get).toHaveBeenCalledWith('id-t1');
    expect(stubFetch).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(await res.text()).toBe('data: {"type":"connected"}\n\n');
  });

  it('prefers the Authorization header token over a token query param', async () => {
    const fakeSse = new Response('data: {"type":"connected"}\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
    const stubFetch = vi.fn().mockResolvedValue(fakeSse);
    const broadcaster = {
      idFromName: vi.fn().mockReturnValue('id-t1'),
      get: vi.fn().mockReturnValue({ fetch: stubFetch }),
    };
    const token = await makeToken({ role: 'admin', tenantId: 't1' });
    const res = await app.fetch(new Request(`${SSE_URL}&token=invalid-query-token`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }), makeEnv({ BROADCASTER: broadcaster }));
    expect(res.status).toBe(200);
    expect(stubFetch).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when a token query param is invalid', async () => {
    const res = await app.fetch(new Request(`${SSE_URL}&token=not-a-real-token`, { method: 'GET' }), makeEnv());
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await app.fetch(new Request(SSE_URL, {
      method: 'GET',
      headers: { Authorization: 'Bearer not-a-real-token' },
    }), makeEnv());
    expect(res.status).toBe(401);
  });

  it('returns 403 for a POS session', async () => {
    const token = await makeToken({ posType: 'pos', role: 'admin', tenantId: 't1' });
    const res = await app.fetch(new Request(SSE_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }), makeEnv());
    expect(res.status).toBe(403);
  });

  it('returns 403 for a non-admin role', async () => {
    const token = await makeToken({ role: 'viewer', tenantId: 't1' });
    const res = await app.fetch(new Request(SSE_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }), makeEnv());
    expect(res.status).toBe(403);
  });

  it('returns 403 when an admin subscribes to a different tenant', async () => {
    const token = await makeToken({ role: 'admin', tenantId: 'other-tenant' });
    const res = await app.fetch(new Request(SSE_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }), makeEnv());
    expect(res.status).toBe(403);
  });

  it('returns 503 when the BROADCASTER binding is missing', async () => {
    const token = await makeToken({ role: 'admin', tenantId: 't1' });
    const res = await app.fetch(new Request(SSE_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }), makeEnv());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain('SSE broadcaster');
  });

  it('forwards to the tenant DO and passes the SSE response through', async () => {
    const fakeSse = new Response('data: {"type":"connected"}\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
    const stubFetch = vi.fn().mockResolvedValue(fakeSse);
    const broadcaster = {
      idFromName: vi.fn().mockReturnValue('id-t1'),
      get: vi.fn().mockReturnValue({ fetch: stubFetch }),
    };
    const token = await makeToken({ role: 'admin', tenantId: 't1' });
    const res = await app.fetch(new Request(SSE_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }), makeEnv({ BROADCASTER: broadcaster }));

    expect(broadcaster.idFromName).toHaveBeenCalledWith('t1');
    expect(broadcaster.get).toHaveBeenCalledWith('id-t1');
    expect(stubFetch).toHaveBeenCalledTimes(1);
    const doReq = stubFetch.mock.calls[0][0];
    expect(doReq.url).toContain('/connect?tenantId=t1');
    expect(doReq.method).toBe('GET');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(await res.text()).toBe('data: {"type":"connected"}\n\n');
  });

  it('accepts a super_admin subscribing to any tenant', async () => {
    const fakeSse = new Response('data: {"type":"connected"}\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
    const stubFetch = vi.fn().mockResolvedValue(fakeSse);
    const broadcaster = {
      idFromName: vi.fn().mockReturnValue('id-t9'),
      get: vi.fn().mockReturnValue({ fetch: stubFetch }),
    };
    const token = await makeToken({ role: 'super_admin', tenantId: null });
    const res = await app.fetch(new Request('https://sinaicamps.com/api/stream/orders?tenantId=t9', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }), makeEnv({ BROADCASTER: broadcaster }));
    expect(res.status).toBe(200);
    expect(stubFetch).toHaveBeenCalledTimes(1);
  });
});
