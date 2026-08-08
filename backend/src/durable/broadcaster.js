/**
 * Broadcaster — per-tenant SSE fan-out hub (Durable Object).
 *
 * Id scheme: one DO instance per tenant. The worker resolves the instance via
 * `env.BROADCASTER.idFromName(tenantId)` then `env.BROADCASTER.get(id)`, so all
 * SSE subscribers for a tenant and every `new-booking` broadcast for that
 * tenant land on the same in-memory channel registry + heartbeat.
 *
 * Routes handled inside the DO:
 *   GET  /connect?tenantId=<id>  → SSE stream (`text/event-stream`). Sends an
 *                                  initial `data: {"type":"connected"}` event,
 *                                  then a `: ping` comment line every 25s.
 *   POST /broadcast              → body `{ tenantId, event }` fans `event` out
 *                                  to every live controller of that tenant.
 *
 * CORS: this object NEVER emits `Access-Control-*` headers — hono/cors in
 * src/index.js is the single source of truth for CORS.
 *
 * Heartbeat tradeoff: Durable Objects cannot run timers once the fetch handler
 * has returned, so each connection's setInterval is kept alive via
 * `state.ctx.waitUntil` and cleared when the connection closes. A
 * storage-alarm heartbeat (`state.storage.setAlarm` + `alarm()`) would avoid
 * pinning the event alive, but would need re-arming on every connect and adds
 * per-instance lifecycle complexity; the interval approach is simpler and
 * self-cleaning here.
 */

const HEARTBEAT_MS = 25000;
const SSE_HEARTBEAT = ': ping\n\n';
const MAX_CONNECTIONS_PER_TENANT = 100;
const SSE_RESPONSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
};

/**
 * Serialize an event into a single SSE `data:` frame. JSON.stringify escapes
 * embedded newlines, so the output is always a one-line `data: <json>` event.
 * @param {Object} event
 * @returns {string}
 */
export function makeEventMessage(event) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Validate + normalize a tenantId coming from a query param or JSON body.
 * @param {*} value
 * @returns {string|null} trimmed id, or null when missing/oversized.
 */
export function parseTenantId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128) return null;
  return trimmed;
}

export class Broadcaster {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    /** @type {Map<string, Set<object>>} tenantId → Set of connection records */
    this.channels = new Map();
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/connect') {
      const tenantId = parseTenantId(url.searchParams.get('tenantId'));
      if (!tenantId) {
        return new Response(JSON.stringify({ error: 'tenantId query parameter is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return this.openStream(tenantId, request);
    }

    if (request.method === 'POST' && url.pathname === '/broadcast') {
      return this.broadcast(request);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  getOrCreateSet(tenantId) {
    let set = this.channels.get(tenantId);
    if (!set) {
      set = new Set();
      this.channels.set(tenantId, set);
    }
    return set;
  }

  openStream(tenantId, request) {
    const encoder = new TextEncoder();
    let conn = null;

    const stream = new ReadableStream({
      start: (controller) => {
        controller.enqueue(encoder.encode(makeEventMessage({ type: 'connected' })));

        const set = this.getOrCreateSet(tenantId);
        // Cap concurrent connections per tenant: when full, evict the oldest
        // (Set iteration order = insertion order).
        while (set.size >= MAX_CONNECTIONS_PER_TENANT) {
          const oldest = set.values().next().value;
          if (!oldest) break;
          this.removeConnection(tenantId, oldest);
        }

        conn = {
          controller,
          interval: null,
          cancelled: false,
          tenantId,
        };
        set.add(conn);

        // Heartbeat comment lines keep proxies from timing out the stream.
        conn.interval = setInterval(() => {
          if (conn.cancelled) {
            clearInterval(conn.interval);
            return;
          }
          try {
            controller.enqueue(encoder.encode(SSE_HEARTBEAT));
          } catch {
            this.removeConnection(tenantId, conn);
          }
        }, HEARTBEAT_MS);

        // DOs have no timers after fetch returns; waitUntil keeps this event
        // (and thus the interval) alive until the connection closes.
        let resolveDone;
        const keepAlive = new Promise((r) => { resolveDone = r; });
        conn._resolveDone = resolveDone;
        if (this.state.ctx && typeof this.state.ctx.waitUntil === 'function') {
          this.state.ctx.waitUntil(keepAlive);
        }
      },
      cancel: () => {
        this.removeConnection(tenantId, conn);
      },
    });

    return new Response(stream, { headers: SSE_RESPONSE_HEADERS });
  }

  async broadcast(request) {
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const tenantId = parseTenantId(body && body.tenantId);
    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'tenantId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (body.event === undefined || body.event === null) {
      return new Response(JSON.stringify({ error: 'event is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const set = this.channels.get(tenantId);
    if (!set || set.size === 0) {
      return new Response(JSON.stringify({ ok: true, delivered: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const message = new TextEncoder().encode(makeEventMessage(body.event));
    let delivered = 0;
    for (const conn of set) {
      if (conn.cancelled) {
        set.delete(conn);
        continue;
      }
      try {
        conn.controller.enqueue(message);
        delivered++;
      } catch {
        this.removeConnection(tenantId, conn);
      }
    }
    if (set.size === 0) this.channels.delete(tenantId);

    return new Response(JSON.stringify({ ok: true, delivered }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  removeConnection(tenantId, conn) {
    if (!conn || conn.cancelled) return;
    conn.cancelled = true;
    if (conn.interval) {
      clearInterval(conn.interval);
      conn.interval = null;
    }
    const set = this.channels.get(tenantId);
    if (set) {
      set.delete(conn);
      if (set.size === 0) this.channels.delete(tenantId);
    }
    if (conn._resolveDone) {
      conn._resolveDone();
      conn._resolveDone = null;
    }
  }
}
