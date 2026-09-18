/**
 * Broadcaster — per-tenant SSE fan-out hub (Durable Object).
 *
 * Id scheme: one DO instance per tenant. The worker resolves the instance via
 * `env.BROADCASTER.idFromName(tenantId)` then `env.BROADCASTER.get(id)`, so all
 * SSE subscribers for a tenant and every `new-booking` broadcast for that
 * tenant land on the same in-memory channel registry + heartbeat.
 *
 * Routes handled inside the DO:
 *   GET  /connect?tenantId=<id>&token=<stream-token>[&lastEventId=…] → SSE
 *        stream (`text/event-stream`). Sends an initial
 *        `data: {"type":"connected"}` event, then a `: ping` comment line
 *        every 25s.
 *   POST /broadcast              → body `{ tenantId, event }` fans `event` out
 *                                  to every live controller of that tenant.
 *
 * Stream-token auth (Wave 3.4a, F-A16-02): the worker forwards a minted
 * 60-second `stream` token; the DO re-verifies it here (defense-in-depth),
 * binds it to this tenant instance (403 on mismatch), and BURNS the jti on
 * first use (native storage TTL, replay → 401). The 24h admin JWT is never
 * accepted on /connect.
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

import { verifyToken } from '../middleware/sharedAuth.js';

const HEARTBEAT_MS = 25000;
const SSE_HEARTBEAT = ': ping\n\n';
const MAX_CONNECTIONS_PER_TENANT = 100;
const STREAM_TOKEN_TTL_SECONDS = 60;
const SSE_RESPONSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
};

/** JSON error response consistent with the worker's errorResponse shape. */
function streamError(status, message) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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

  async openStream(tenantId, request) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    const lastEventId = url.searchParams.get('lastEventId');

    // ── Stream-token validation (Wave 3.4a, F-A16-02) ──────────────
    // The ONLY credential allowed on /connect is a short-lived single-use
    // `stream` token minted via POST /api/stream/token. Defense-in-depth at
    // the DO: even if the worker gate is bypassed, a missing/invalid token
    // → 401, tenant mismatch → 403, and replay of a burned jti → 401.
    if (!token) {
      return streamError(401, 'Missing or invalid stream token');
    }
    const decoded = await verifyToken(token, this.env.JWT_SECRET);
    if (!decoded) {
      return streamError(401, 'Invalid or expired stream token');
    }
    // Token-type allow-list: only `stream` tokens may open a stream.
    if (decoded.type !== 'stream') {
      return streamError(401, 'Invalid stream token type');
    }
    // Realm binding: POS (org) sessions can never open an admin stream.
    if (decoded.posType === 'pos' || decoded.userType === 'org') {
      return streamError(403, 'Forbidden: POS sessions are not allowed to access admin streams');
    }
    // Role allow-list must mirror the worker gate.
    if (!['admin', 'super_admin'].includes(decoded.role)) {
      return streamError(403, 'Forbidden: admin role required');
    }
    // Tenant binding: this DO instance IS tenantId — a token minted for a
    // different tenant cannot subscribe.
    if (decoded.tenantId !== tenantId) {
      return streamError(403, 'Forbidden: Access denied to this tenant partition');
    }
    // Single-use: burn the jti with a native TTL matching the token lifetime.
    // Fail-closed when storage cannot enforce it rather than silently weaken.
    if (typeof this.state?.storage?.put !== 'function' || typeof this.state?.storage?.get !== 'function') {
      return streamError(500, 'Stream token single-use enforcement unavailable');
    }
    const jti = decoded.jti;
    if (!jti) {
      return streamError(401, 'Stream token missing jti');
    }
    if (await this.state.storage.get(jti)) {
      return streamError(401, 'Stream token has already been used');
    }
    await this.state.storage.put(jti, Date.now(), { expirationTtl: STREAM_TOKEN_TTL_SECONDS });

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
          // Wave 3.4a: connect marker forwarded from the request (replay
          // consumption of the marker is the follow-up Wave 3.4b).
          lastEventId: lastEventId || null,
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
