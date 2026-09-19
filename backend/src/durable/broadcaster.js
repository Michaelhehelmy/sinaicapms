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
 *        stream (`text/event-stream`). When `lastEventId` is present the DO
 *        first emits `event: reset` if replay coverage is unprovable, replays
 *        the bounded backlog it missed, then sends the initial
 *        `data: {"type":"connected"}` event, then a `: ping` comment line
 *        every 25s.
 *   POST /broadcast              → body `{ tenantId, event }`. The frame is
 *                                  retained in the bounded replay buffer
 *                                  BEFORE fan-out (fail-closed), then fanned
 *                                  out to every live controller of that tenant.
 *                                  Retention happens even with zero live
 *                                  subscribers — that offline case is exactly
 *                                  what replay exists to serve.
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
// Bounded replay buffer (Wave 3.4b, F-A16-03). TWO caps: an event count and a
// byte budget. A chatty tenant could otherwise fill DO memory with a single
// burst of large events, so the byte cap trims first when events are chunky.
const MAX_REPLAY_EVENTS = 100;
const MAX_REPLAY_BYTES = 128 * 1024;
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
 * Serialize an event into a single SSE frame. JSON.stringify escapes embedded
 * newlines, so the output is always a one-line `data: <json>` event.
 *
 * When `id` is provided, an `id: <n>` line is prepended. The browser exposes
 * that as `MessageEvent.lastEventId`, which is the replay marker the client
 * echoes back on reconnect. The 1-arg form is byte-for-byte unchanged so the
 * existing helper tests stay valid.
 *
 * @param {Object} event
 * @param {number|string|null} [id]
 * @returns {string}
 */
export function makeEventMessage(event, id) {
  const frame = `data: ${JSON.stringify(event)}\n\n`;
  if (id === undefined || id === null) return frame;
  return `id: ${id}\n${frame}`;
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
    // Replay state, keyed by tenantId. The worker routes one DO instance per
    // tenant via idFromName(tenantId), so keying is defense-in-depth: a
    // misrouted broadcast must never land in another tenant's replay window.
    // In-memory only — instance eviction degrades replay to best-effort and
    // costs zero D1/KV/R2 writes.
    /** @type {Map<string, {seq: number, entries: Array<{id: number, message: Uint8Array, bytes: number}>, bytes: number}>} */
    this.replay = new Map();
  }

  /** Read-or-create the replay state for a tenant. */
  getReplayState(tenantId) {
    let state = this.replay.get(tenantId);
    if (!state) {
      state = { seq: 0, entries: [], bytes: 0 };
      this.replay.set(tenantId, state);
    }
    return state;
  }

  /**
   * Retain one broadcast frame for replay, trimming oldest-first until BOTH
   * the count and byte caps hold. A throw is the caller's signal to fail
   * closed (drop the event from fan-out too) instead of letting live
   * subscribers diverge from the replay buffer.
   * @param {string} tenantId
   * @param {number} id
   * @param {Uint8Array} message
   */
  appendToHistory(tenantId, id, message) {
    const state = this.getReplayState(tenantId);
    const bytes = message.byteLength ?? message.length;
    state.entries.push({ id, message, bytes });
    state.bytes += bytes;
    while (state.entries.length > MAX_REPLAY_EVENTS || state.bytes > MAX_REPLAY_BYTES) {
      const evicted = state.entries.shift();
      if (!evicted) break;
      state.bytes -= evicted.bytes;
    }
  }

  /**
   * Decide what a reconnecting client must receive.
   *
   * `stale` means coverage cannot be proven — the marker is unparsable, or it
   * predates the oldest buffered id (events between marker+1 and
   * entries[0].id-1 were evicted), or the client presented a marker while the
   * buffer is empty (e.g. the DO was evicted). A stale client is sent an
   * `event: reset` frame so it refetches, then the bounded replay.
   *
   * A marker exactly one behind entries[0].id is NOT stale: the client has
   * seen everything up to the buffer start, so the replay is contiguous.
   *
   * @param {string} tenantId
   * @param {string|null} markerRaw
   * @returns {{stale: boolean, missed: Array<{id: number, message: Uint8Array}>}}
   */
  computeReplay(tenantId, markerRaw) {
    const state = this.replay.get(tenantId) ?? { entries: [] };
    const present = markerRaw !== null && markerRaw !== '';
    if (!present) {
      // First connect with no marker: nothing was missed, so no reset.
      return { stale: false, missed: [] };
    }
    const marker = Number.parseInt(markerRaw, 10);
    if (!Number.isFinite(marker)) {
      // Unparsable marker: coverage unprovable → reset + full bounded replay.
      return { stale: true, missed: state.entries.slice() };
    }
    if (state.entries.length === 0) {
      // Client has state but we can prove nothing → reset, nothing to replay.
      return { stale: true, missed: [] };
    }
    return {
      stale: marker < state.entries[0].id - 1,
      missed: state.entries.filter((entry) => entry.id > marker),
    };
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
        // Replay (Wave 3.4b, F-A16-03): if the client presents a marker, tell
        // it to refetch when coverage is unprovable, then stream back the
        // bounded backlog it missed — all BEFORE announcing `connected`.
        const { stale, missed } = this.computeReplay(tenantId, lastEventId);
        if (stale) {
          controller.enqueue(encoder.encode('event: reset\ndata: {}\n\n'));
        }
        for (const entry of missed) {
          controller.enqueue(entry.message);
        }

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
          // The replay marker was consumed by computeReplay() above, before
          // the stream went live; retained here for observability.
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

    // Assign the replay id and retain the frame BEFORE fan-out (fail-closed).
    // If retention fails, the event must NOT reach live subscribers either —
    // otherwise a reconnecting client silently misses an event that a live
    // client saw. Append → fan-out, never fan-out → append.
    const replayState = this.getReplayState(tenantId);
    const id = ++replayState.seq;
    const message = new TextEncoder().encode(makeEventMessage(body.event, id));
    try {
      this.appendToHistory(tenantId, id, message);
    } catch {
      return streamError(500, 'Replay buffer append failed');
    }

    const set = this.channels.get(tenantId);
    if (!set || set.size === 0) {
      // No live subscribers — the frame is still retained above, which is the
      // entire point of replay: the offline client is the case it must serve.
      return new Response(JSON.stringify({ ok: true, delivered: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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
