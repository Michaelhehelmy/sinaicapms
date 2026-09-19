import { describe, it, expect, vi } from 'vitest';
import { Broadcaster, makeEventMessage, parseTenantId } from '../src/durable/broadcaster.js';
import ordersRoutes, { broadcastNewBooking } from '../src/api/orders.js';
import { mountRouter } from './helpers/routerHarness.js';
import { generateToken } from '../src/middleware/sharedAuth.js';
import jwt, { decode as decodeJwt } from '@tsndr/cloudflare-worker-jwt';

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
  const db = {
    prepare: vi.fn().mockReturnValue(chain),
    // H1 fix: POST /orders sends its availability-guarded INSERT via DB.batch
    batch: vi.fn().mockResolvedValue([{ meta: { changes: 1 } }]),
  };
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

// A fresh 60s single-use stream token (own jti per call). Two calls must never
// reuse a jti — the DO burns tokens via state.storage.
function makeJti(prefix) {
  return crypto?.randomUUID ? crypto.randomUUID() : `${prefix || 'jti'}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function makeStreamToken(overrides = {}) {
  const jti = makeJti('stream');
  return await generateToken(
    { sub: 'u1', userId: 'u1', email: 'a@b.com', role: 'admin', tenantId: 't1', jti, ...overrides },
    SECRET,
    'stream',
    null,
    60
  );
}

// Directly sign an expired stream token — the mint endpoint never issues
// expired tokens, so the expiry test has to forge one (owner test #6).
async function makeExpiredStreamToken(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return await jwt.sign(
    {
      sub: 'u1', userId: 'u1', email: 'a@b.com', role: 'admin', tenantId: 't1',
      jti: makeJti('expired'), type: 'stream',
      iat: now - 120, exp: now - 60,
      ...overrides,
    },
    SECRET,
    { algorithm: 'HS256' }
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
  // Manual storage mock behaves like blocks/storage: put stores, get returns
  // what was stored (or null). This makes the single-use token burn observable
  // and lets keyed writes be asserted directly.
  function makeBroadcaster() {
    const ctx = { waitUntil: vi.fn() };
    const store = new Map();
    const storage = {
      setAlarm: vi.fn(),
      get: vi.fn(async (key) => (store.has(key) ? store.get(key) : null)),
      put: vi.fn(async (key, value) => { store.set(key, value); }),
    };
    const b = new Broadcaster({ ctx, storage }, { JWT_SECRET: SECRET });
    return { b, ctx, storage, store };
  }

  async function openStream(b, tenantId = 't1', overrides = {}, lastEventId = '') {
    const token = await makeStreamToken(overrides);
    const marker = lastEventId ? `&lastEventId=${encodeURIComponent(lastEventId)}` : '';
    const res = await b.fetch(new Request(`http://broadcaster/connect?tenantId=${tenantId}&token=${token}${marker}`, { method: 'GET' }));
    return { res, reader: res.body.getReader() };
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
    const { res, reader } = await openStream(b);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const { value, done } = await reader.read();
    expect(done).toBe(false);
    expect(new TextDecoder().decode(value)).toContain('"type":"connected"');
    await reader.cancel();
  });

  it('fans a broadcast out to live subscribers of the same tenant', async () => {
    const { b, storage } = makeBroadcaster();
    const { res: res1, reader: reader1 } = await openStream(b);
    const { res: res2, reader: reader2 } = await openStream(b);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
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
    const { reader } = await openStream(b, 't1');
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

  describe('bounded replay (Wave 3.4b, F-A16-03)', () => {
    const decode = (value) => new TextDecoder().decode(value);

    async function broadcast(b, tenantId, event) {
      return b.fetch(new Request('http://broadcaster/broadcast', {
        method: 'POST',
        body: JSON.stringify({ tenantId, event }),
      }));
    }

    it('emits an SSE id line when an id is supplied, and stays byte-identical without one', () => {
      expect(makeEventMessage({ type: 'x' }, 7)).toBe('id: 7\ndata: {"type":"x"}\n\n');
      expect(makeEventMessage({ type: 'x' })).toBe('data: {"type":"x"}\n\n');
    });

    it('retains a broadcast even with zero live subscribers (the crux regression)', async () => {
      const { b } = makeBroadcaster();
      // No subscriber is connected at broadcast time — the pre-3.4b code
      // early-returned without retaining anything, which is exactly the
      // offline-client case replay exists to serve.
      const res = await broadcast(b, 't1', { type: 'first' });
      expect(await res.json()).toEqual({ ok: true, delivered: 0 });

      const { reader } = await openStream(b, 't1', {}, '0');
      const first = decode((await reader.read()).value);
      expect(first).toContain('"type":"first"');
      expect(first).toContain('id: 1');
      expect(first).not.toContain('event: reset');
      const second = decode((await reader.read()).value);
      expect(second).toContain('"type":"connected"');
      await reader.cancel();
    });

    it('replays only the missed frames when the marker is inside the buffer, with no reset', async () => {
      const { b } = makeBroadcaster();
      await broadcast(b, 't1', { type: 'e1' });
      await broadcast(b, 't1', { type: 'e2' });
      await broadcast(b, 't1', { type: 'e3' });

      // Marker 1: the client already has e1, so only e2/e3 are replayed and the
      // coverage is provably contiguous (no reset).
      const { reader } = await openStream(b, 't1', {}, '1');
      const first = decode((await reader.read()).value);
      expect(first).not.toContain('event: reset');
      expect(first).toContain('"type":"e2"');
      expect(first).toContain('id: 2');
      const second = decode((await reader.read()).value);
      expect(second).toContain('"type":"e3"');
      expect(second).toContain('id: 3');
      expect(decode((await reader.read()).value)).toContain('"type":"connected"');
      await reader.cancel();
    });

    it('sends reset before the bounded replay when the marker predates the buffer', async () => {
      const { b } = makeBroadcaster();
      // Overflow the 100-event count cap so ids 1-1 (id 1) is evicted.
      for (let i = 0; i < 101; i += 1) await broadcast(b, 't1', { type: 'bulk', i });

      // Marker 0 is older than the oldest retained id (2) → coverage unprovable.
      const { reader } = await openStream(b, 't1', {}, '0');
      const first = decode((await reader.read()).value);
      expect(first).toBe('event: reset\ndata: {}\n\n');
      const replayed = decode((await reader.read()).value);
      expect(replayed).toContain('id: 2');
      expect(replayed).toContain('"type":"bulk"');
      await reader.cancel();
    });

    it('treats a marker exactly one behind the buffer start as contiguous (no reset)', async () => {
      const { b } = makeBroadcaster();
      for (let i = 0; i < 101; i += 1) await broadcast(b, 't1', { type: 'bulk', i });

      const { reader } = await openStream(b, 't1', {}, '1');
      const first = decode((await reader.read()).value);
      expect(first).not.toContain('event: reset');
      expect(first).toContain('id: 2');
      await reader.cancel();
    });

    it('sends reset with an empty replay when a marker is presented but the buffer is empty', async () => {
      const { b } = makeBroadcaster();
      const { reader } = await openStream(b, 't1', {}, '42');
      expect(decode((await reader.read()).value)).toBe('event: reset\ndata: {}\n\n');
      expect(decode((await reader.read()).value)).toContain('"type":"connected"');
      await reader.cancel();
    });

    it('sends reset followed by the full buffer when the marker is unparsable', async () => {
      const { b } = makeBroadcaster();
      await broadcast(b, 't1', { type: 'e1' });
      await broadcast(b, 't1', { type: 'e2' });

      const { reader } = await openStream(b, 't1', {}, 'not-a-number');
      expect(decode((await reader.read()).value)).toBe('event: reset\ndata: {}\n\n');
      expect(decode((await reader.read()).value)).toContain('id: 1');
      await reader.cancel();
    });

    it('keeps a first connect with no marker replay-free and reset-free', async () => {
      const { b } = makeBroadcaster();
      await broadcast(b, 't1', { type: 'e1' });
      const { reader } = await openStream(b, 't1');
      const first = decode((await reader.read()).value);
      expect(first).toContain('"type":"connected"');
      expect(first).not.toContain('event: reset');
      expect(first).not.toContain('id: 1');
      await reader.cancel();
    });

    it('caps the buffer at 100 events, evicting oldest-first', async () => {
      const { b } = makeBroadcaster();
      for (let i = 0; i < 105; i += 1) await broadcast(b, 't1', { type: 'bulk', i });

      const state = b.replay.get('t1');
      expect(state.entries).toHaveLength(100);
      expect(state.entries[0].id).toBe(6);
      expect(state.entries[99].id).toBe(105);
    });

    it('caps retained bytes at 128KB, evicting oldest-first until under the cap', async () => {
      const { b } = makeBroadcaster();
      // ~70KB per frame: two frames overflow 128KB, so the oldest is evicted.
      const blob = 'x'.repeat(70000);
      await broadcast(b, 't1', { type: 'big', blob });
      await broadcast(b, 't1', { type: 'big', blob });

      const state = b.replay.get('t1');
      expect(state.bytes).toBeLessThanOrEqual(128 * 1024);
      expect(state.entries).toHaveLength(1);
      expect(state.entries[0].id).toBe(2);
    });

    it('fails closed: an append failure drops the event from fan-out entirely', async () => {
      const { b } = makeBroadcaster();
      const { reader } = await openStream(b);
      await reader.read();

      b.appendToHistory = () => {
        throw new Error('replay store exploded');
      };

      const res = await broadcast(b, 't1', { type: 'new-booking', orderId: 'o1' });
      expect(res.status).toBe(500);

      // No live subscriber may receive a frame the replay buffer rejected —
      // otherwise a reconnecting client silently misses it.
      const next = await Promise.race([
        reader.read().then(({ value }) => ({ framed: value !== undefined })),
        new Promise((r) => setTimeout(() => r({ framed: false }), 20)),
      ]);
      expect(next.framed).toBe(false);
      await reader.cancel();
    });

    it('keeps replay buffers isolated per tenant', async () => {
      const { b } = makeBroadcaster();
      await broadcast(b, 't1', { type: 'for-t1' });

      // t1's buffer must not bleed into another tenant's replay window.
      expect(b.replay.has('other')).toBe(false);
      const { reader } = await openStream(b, 'other', { tenantId: 'other' });
      const first = decode((await reader.read()).value);
      expect(first).toContain('"type":"connected"');
      expect(first).not.toContain('for-t1');
      await reader.cancel();
    });
  });

  it('returns 404 for unknown DO paths', async () => {
    const { b } = makeBroadcaster();
    const res = await b.fetch(new Request('http://broadcaster/nope', { method: 'GET' }));
    expect(res.status).toBe(404);
  });

  it('cancel handler removes the connection and clears the interval', async () => {
    const { b } = makeBroadcaster();
    const { res, reader } = await openStream(b);
    await reader.read();

    expect(b.channels.get('t1').size).toBe(1);
    await reader.cancel();

    expect(b.channels.has('t1')).toBe(false);
  });

  it('removeConnection is idempotent when called twice on the same conn', async () => {
    const { b } = makeBroadcaster();
    const { res, reader } = await openStream(b);
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
    const { res, reader } = await openStream(b);
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
      const { res, reader } = await openStream(b);
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

    const { res, reader } = await openStream(b);
    await reader.read();

    expect(b.channels.get('t1').size).toBe(100);
    expect(fakeConns[0].cancelled).toBe(true);
    await reader.cancel();
  });

  it('heartbeat catch branch removes the connection when enqueue throws', async () => {
    vi.useFakeTimers();
    try {
      const { b } = makeBroadcaster();
      const { res, reader } = await openStream(b);
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

describe('Broadcaster stream-token validation (DO defense-in-depth)', () => {
  function makeBroadcaster() {
    const ctx = { waitUntil: vi.fn() };
    const store = new Map();
    const storage = {
      setAlarm: vi.fn(),
      get: vi.fn(async (key) => (store.has(key) ? store.get(key) : null)),
      put: vi.fn(async (key, value) => { store.set(key, value); }),
    };
    const b = new Broadcaster({ ctx, storage }, { JWT_SECRET: SECRET });
    return { b, ctx, storage, store };
  }

  it('returns 401 when the stream token is missing', async () => {
    const { b } = makeBroadcaster();
    const res = await b.fetch(new Request('http://broadcaster/connect?tenantId=t1', { method: 'GET' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Missing or invalid stream token');
  });

  it('returns 401 for an invalid stream token', async () => {
    const { b } = makeBroadcaster();
    const res = await b.fetch(new Request('http://broadcaster/connect?tenantId=t1&token=not-a-jwt', { method: 'GET' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Invalid or expired stream token');
  });

  it('returns 401 for an expired stream token', async () => {
    const { b } = makeBroadcaster();
    const token = await makeExpiredStreamToken();
    const res = await b.fetch(new Request(`http://broadcaster/connect?tenantId=t1&token=${token}`, { method: 'GET' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Invalid or expired stream token');
  });

  it('returns 401 when the token type is not stream (24h admin JWT is not accepted on /connect)', async () => {
    const { b } = makeBroadcaster();
    const adminToken = await makeToken({ role: 'admin', tenantId: 't1' });
    const res = await b.fetch(new Request(`http://broadcaster/connect?tenantId=t1&token=${adminToken}`, { method: 'GET' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Invalid stream token type');
  });

  it('returns 401 for a stream token missing jti', async () => {
    const { b } = makeBroadcaster();
    const token = await makeStreamToken({ jti: undefined });
    const res = await b.fetch(new Request(`http://broadcaster/connect?tenantId=t1&token=${token}`, { method: 'GET' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('missing jti');
  });

  it('returns 403 for a POS realm stream token', async () => {
    const { b } = makeBroadcaster();
    const token = await makeStreamToken({ posType: 'pos', userType: 'org' });
    const res = await b.fetch(new Request(`http://broadcaster/connect?tenantId=t1&token=${token}`, { method: 'GET' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('POS sessions');
  });

  it('returns 403 for a non-admin stream token', async () => {
    const { b } = makeBroadcaster();
    const token = await makeStreamToken({ role: 'viewer' });
    const res = await b.fetch(new Request(`http://broadcaster/connect?tenantId=t1&token=${token}`, { method: 'GET' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('admin role required');
  });

  it('returns 403 when a stream token is used against a different tenant partition', async () => {
    const { b } = makeBroadcaster();
    const token = await makeStreamToken({ tenantId: 'other-tenant' });
    const res = await b.fetch(new Request(`http://broadcaster/connect?tenantId=t1&token=${token}`, { method: 'GET' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('this tenant partition');
  });

  it('burns the token on first use and rejects a replay (single-use, owner test #5)', async () => {
    const { b, storage } = makeBroadcaster();
    const token = await makeStreamToken();
    const { payload } = decodeJwt(token);

    const res1 = await b.fetch(new Request(`http://broadcaster/connect?tenantId=t1&token=${token}`, { method: 'GET' }));
    expect(res1.status).toBe(200);
    const reader = res1.body.getReader();
    await reader.read();
    await reader.cancel();
    expect(storage.put).toHaveBeenCalledWith(payload.jti, expect.any(Number), { expirationTtl: 60 });

    const res2 = await b.fetch(new Request(`http://broadcaster/connect?tenantId=t1&token=${token}`, { method: 'GET' }));
    expect(res2.status).toBe(401);
    const body = await res2.json();
    expect(body.error).toContain('already been used');
  });

  it('returns 500 when storage cannot enforce single-use (no put/get capability)', async () => {
    const ctx = { waitUntil: vi.fn() };
    const storage = { setAlarm: vi.fn() };
    const b = new Broadcaster({ ctx, storage }, { JWT_SECRET: SECRET });
    const token = await makeStreamToken();
    const res = await b.fetch(new Request(`http://broadcaster/connect?tenantId=t1&token=${token}`, { method: 'GET' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('single-use enforcement unavailable');
  });

  it('fails closed when the storage burn write rejects (no stream is opened)', async () => {
    const ctx = { waitUntil: vi.fn() };
    const storage = {
      setAlarm: vi.fn(),
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockRejectedValue(new Error('no blocks/storage')),
    };
    const b = new Broadcaster({ ctx, storage }, { JWT_SECRET: SECRET });
    const token = await makeStreamToken();
    await expect(
      b.fetch(new Request(`http://broadcaster/connect?tenantId=t1&token=${token}`, { method: 'GET' }))
    ).rejects.toThrow('no blocks/storage');
    // The connection must never be registered when the token cannot be burned.
    expect(b.channels.has('t1')).toBe(false);
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
      (ch) => { ch.all.mockResolvedValue({ results: [] }); }, // customer by email
      (ch) => { ch.all.mockResolvedValue({ results: [] }); }, // customer by phone
      (ch) => { ch.run.mockResolvedValue({}); }, // customer insert
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

  it('accepts the stream token from the token query param when the Authorization header is absent', async () => {
    const fakeSse = new Response('data: {"type":"connected"}\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
    const stubFetch = vi.fn().mockResolvedValue(fakeSse);
    const broadcaster = {
      idFromName: vi.fn().mockReturnValue('id-t1'),
      get: vi.fn().mockReturnValue({ fetch: stubFetch }),
    };
    const token = await makeStreamToken({ role: 'admin', tenantId: 't1' });
    const res = await app.fetch(new Request(`${SSE_URL}&token=${token}`, { method: 'GET' }), makeEnv({ BROADCASTER: broadcaster }));

    expect(broadcaster.idFromName).toHaveBeenCalledWith('t1');
    expect(broadcaster.get).toHaveBeenCalledWith('id-t1');
    expect(stubFetch).toHaveBeenCalledTimes(1);
    // The exact validated stream token is what reaches the DO — never a JWT.
    expect(stubFetch.mock.calls[0][0].url).toContain('token=' + encodeURIComponent(token));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(await res.text()).toBe('data: {"type":"connected"}\n\n');
  });

  it('prefers the Authorization header stream token over a token query param', async () => {
    const fakeSse = new Response('data: {"type":"connected"}\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
    const stubFetch = vi.fn().mockResolvedValue(fakeSse);
    const broadcaster = {
      idFromName: vi.fn().mockReturnValue('id-t1'),
      get: vi.fn().mockReturnValue({ fetch: stubFetch }),
    };
    const token = await makeStreamToken({ role: 'admin', tenantId: 't1' });
    const res = await app.fetch(new Request(`${SSE_URL}&token=invalid-query-token`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }), makeEnv({ BROADCASTER: broadcaster }));
    expect(res.status).toBe(200);
    expect(stubFetch).toHaveBeenCalledTimes(1);
    expect(stubFetch.mock.calls[0][0].url).toContain('token=' + encodeURIComponent(token));
  });

  it('rejects a 24h admin JWT in the token query param (owner test #3)', async () => {
    const adminJwt = await makeToken({ role: 'admin', tenantId: 't1' });
    const res = await app.fetch(new Request(`${SSE_URL}&token=${adminJwt}`, { method: 'GET' }), makeEnv());
    expect(res.status).toBe(401);
  });

  it('returns 401 when a token query param is invalid', async () => {
    const res = await app.fetch(new Request(`${SSE_URL}&token=not-a-real-token`, { method: 'GET' }), makeEnv());
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid stream token in the Authorization header', async () => {
    const res = await app.fetch(new Request(SSE_URL, {
      method: 'GET',
      headers: { Authorization: 'Bearer not-a-real-token' },
    }), makeEnv());
    expect(res.status).toBe(401);
  });

  it('returns 403 for a POS realm stream token', async () => {
    const token = await makeStreamToken({ posType: 'pos', userType: 'org', role: 'admin', tenantId: 't1' });
    const res = await app.fetch(new Request(SSE_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }), makeEnv());
    expect(res.status).toBe(403);
  });

  it('returns 403 for a non-admin stream token', async () => {
    const token = await makeStreamToken({ role: 'viewer', tenantId: 't1' });
    const res = await app.fetch(new Request(SSE_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }), makeEnv());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('admin role required');
  });

  it('returns 403 when an admin stream token subscribes to a different tenant', async () => {
    const token = await makeStreamToken({ role: 'admin', tenantId: 'other-tenant' });
    const res = await app.fetch(new Request(SSE_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }), makeEnv());
    expect(res.status).toBe(403);
  });

  it('returns 503 when the BROADCASTER binding is missing', async () => {
    const token = await makeStreamToken({ role: 'admin', tenantId: 't1' });
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
    const token = await makeStreamToken({ role: 'admin', tenantId: 't1' });
    const res = await app.fetch(new Request(SSE_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }), makeEnv({ BROADCASTER: broadcaster }));

    expect(broadcaster.idFromName).toHaveBeenCalledWith('t1');
    expect(broadcaster.get).toHaveBeenCalledWith('id-t1');
    expect(stubFetch).toHaveBeenCalledTimes(1);
    const doReq = stubFetch.mock.calls[0][0];
    expect(doReq.url).toContain('/connect?tenantId=t1');
    expect(doReq.url).toContain('token=' + encodeURIComponent(token));
    expect(doReq.method).toBe('GET');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(await res.text()).toBe('data: {"type":"connected"}\n\n');
  });

  it('forwards a lastEventId marker on the DO connect URL', async () => {
    const fakeSse = new Response('data: {"type":"connected"}\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
    const stubFetch = vi.fn().mockResolvedValue(fakeSse);
    const broadcaster = {
      idFromName: vi.fn().mockReturnValue('id-t1'),
      get: vi.fn().mockReturnValue({ fetch: stubFetch }),
    };
    const token = await makeStreamToken({ role: 'admin', tenantId: 't1' });
    const res = await app.fetch(new Request(`${SSE_URL}&token=${token}&lastEventId=evt_42`, { method: 'GET' }), makeEnv({ BROADCASTER: broadcaster }));
    expect(res.status).toBe(200);
    expect(stubFetch).toHaveBeenCalledTimes(1);
    expect(stubFetch.mock.calls[0][0].url).toContain('lastEventId=evt_42');
  });

  it('accepts a super_admin stream token subscribing to any tenant', async () => {
    const fakeSse = new Response('data: {"type":"connected"}\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
    const stubFetch = vi.fn().mockResolvedValue(fakeSse);
    const broadcaster = {
      idFromName: vi.fn().mockReturnValue('id-t9'),
      get: vi.fn().mockReturnValue({ fetch: stubFetch }),
    };
    const token = await makeStreamToken({ role: 'super_admin', tenantId: 't9' });
    const res = await app.fetch(new Request('https://sinaicamps.com/api/stream/orders?tenantId=t9', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }), makeEnv({ BROADCASTER: broadcaster }));
    expect(res.status).toBe(200);
    expect(stubFetch).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/stream/token (mint endpoint)', () => {
  const MINT_URL = 'https://sinaicamps.com/api/stream/token';

  it('returns 401 without an admin JWT (owner test #1)', async () => {
    const res = await app.fetch(new Request(MINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }), makeEnv());
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid admin JWT', async () => {
    const res = await app.fetch(new Request(MINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer not-a-real-token' },
      body: '{}',
    }), makeEnv());
    expect(res.status).toBe(401);
  });

  it('returns 403 for a viewer role', async () => {
    const token = await makeToken({ role: 'viewer', tenantId: 't1' });
    const res = await app.fetch(new Request(MINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
    }), makeEnv());
    expect(res.status).toBe(403);
  });

  it('returns 400 when no tenant resolves (super_admin without a tenant claim)', async () => {
    const token = await makeToken({ role: 'super_admin', tenantId: null });
    const res = await app.fetch(new Request(MINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
    }), makeEnv());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Tenant not resolved');
  });

  it('mints a 60s single-use stream token (owner test #2)', async () => {
    const token = await makeToken({ role: 'admin', tenantId: 't1' });
    const res = await app.fetch(new Request(MINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
    }), makeEnv());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.type).toBe('stream');
    expect(body.expiresIn).toBe(60);
    expect(typeof body.token).toBe('string');

    const { payload } = decodeJwt(body.token);
    expect(payload.type).toBe('stream');
    expect(payload.role).toBe('admin');
    expect(payload.tenantId).toBe('t1');
    expect(payload.jti).toBeTruthy();
    // 60s lifetime: exp within 60 seconds of iat (allow clock slack).
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(60);
    expect(payload.exp - payload.iat).toBeGreaterThan(50);
  });

  it('mints for a super_admin who carries a tenant claim', async () => {
    const token = await makeToken({ role: 'super_admin', tenantId: 't1' });
    const res = await app.fetch(new Request(MINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
    }), makeEnv());
    expect(res.status).toBe(201);
    const body = await res.json();
    const { payload } = decodeJwt(body.token);
    expect(payload.tenantId).toBe('t1');
  });

  it('mints unique jti values across two calls (single-use depends on unique jti)', async () => {
    const token = await makeToken({ role: 'admin', tenantId: 't1' });
    const first = await (await app.fetch(new Request(MINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
    }), makeEnv())).json();
    const second = await (await app.fetch(new Request(MINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
    }), makeEnv())).json();
    const p1 = decodeJwt(first.token).payload;
    const p2 = decodeJwt(second.token).payload;
    expect(p1.jti).not.toBe(p2.jti);
  });
});
