/**
 * ANTI-RESTORE (F-A16-02) — READ BEFORE REVERTING THIS FILE:
 * This client must NEVER go back to passing the 24h admin JWT directly in the
 * stream URL. EventSource cannot set headers, so the legacy design put a full
 * admin session credential in the query string for 24 hours (visible in
 * browser history, proxy logs, RUM traces). The replacement is
 * `mintStreamToken()`: the admin JWT stays in an Authorization header while
 * the stream URL carries a 60-SECOND, SINGLE-USE, tenant-bound `stream` token
 * issued by POST /api/stream/token. The hooks re-mint before every (re)connect.
 *
 * HONEST LIMITATION: the stream token is STILL in the query string — the
 * defense is the short TTL, the DO-enforced single-use (replay → 401), and
 * the tenant binding, not "no token in URL". Do not claim otherwise, and do
 * not restore the 24h admin JWT to the URL.
 *
 * See .opencode/audits/wave-3.4-pre-reads.txt (F-A16-02) + AGENT_LOGBOOK.md.
 */

/**
 * Server-Sent Events (SSE) client for the live bookings + inbox streams.
 *
 * Backend contract (GET /api/stream/orders):
 *   - first frame: { "type": "connected" }
 *   - then frames: { "type": "new-booking", "orderId", "campId", "checkIn", "checkOut" }
 *     or { "type": "new-lead", "leadId", "name", "subject" }
 * Frames arrive as `data: <json>\n\n`.
 *
 * The stream endpoint is per-tenant and generic: one URL delivers BOTH
 * `new-booking` and `new-lead` events. `openOrdersStream` is the bookings
 * consumer; `openInboxStream` is the unified-inbox consumer (same URL).
 *
 * EventSource cannot set custom headers, so the stream credential rides the
 * `token` query parameter — but it is a short-lived single-use `stream` token
 * from POST /api/stream/token (see the ANTI-RESTORE comment above), never the
 * 24h admin JWT.
 */

import { API_BASE } from './api';

/**
 * Error thrown by `mintStreamToken`. `status` classifies the failure so the
 * hooks can decide whether to retry (ambiguous: network/5xx/timeout) or stop
 * (hard: 401/403).
 */
export class StreamTokenMintError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'StreamTokenMintError';
    this.status = status;
  }
}

export interface StreamTokenMintResult {
  token: string;
  expiresIn: number;
  type: 'stream';
}

/**
 * Exchange an admin JWT for a 60-second, single-use stream token.
 *
 * `Authorization: Bearer <adminJwt>` → POST {apiBase}/stream/token →
 * `{ token, expiresIn, type: 'stream' }`. The stream token is what may travel
 * on the SSE query string (still short-lived + burned on first use).
 *
 * Failure classification (via `StreamTokenMintError.status`):
 *   401/403 → hard authorization failure — the caller should stop reconnecting
 *   0 (network), 408, 429, >=500 → ambiguous — retry is allowed
 */
export async function mintStreamToken(apiBase: string, adminToken: string): Promise<StreamTokenMintResult> {
  const base = apiBase.replace(/\/+$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}/stream/token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  } catch {
    throw new StreamTokenMintError(0, 'Network error while minting stream token');
  }
  if (!res.ok) {
    let message = `Stream token mint failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (typeof body.error === 'string' && body.error) message = body.error;
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new StreamTokenMintError(res.status, message);
  }
  let data: Partial<StreamTokenMintResult>;
  try {
    data = (await res.json()) as Partial<StreamTokenMintResult>;
  } catch {
    throw new StreamTokenMintError(500, 'Stream token mint returned an invalid body');
  }
  if (typeof data.token !== 'string' || !data.token) {
    throw new StreamTokenMintError(500, 'Stream token mint returned no token');
  }
  return { token: data.token, expiresIn: data.expiresIn ?? 60, type: 'stream' };
}

/**
 * Parse one SSE `data:` frame into a JSON value.
 *
 * Strips the `data:` prefix and surrounding whitespace, then JSON.parses the
 * payload. Returns `null` when the frame is not a `data:` line, has an empty
 * payload, or contains malformed JSON. Never throws.
 */
export function parseSSEEvent(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('data:')) return null;
  const payload = trimmed.slice('data:'.length).trim();
  if (!payload) return null;
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
}

export interface OpenOrdersStreamOptions {
  /**
   * API base INCLUDING the `/api/v1` prefix — reuse `API_BASE` from `./api`
   * (e.g. `http://localhost:8787/api/v1` or `/api/v1`). Defaults to `API_BASE`.
   */
  apiBase?: string;
  /** Tenant whose bookings should be streamed. */
  tenantId: string;
  /** Freshly minted single-use stream token (POST /api/stream/token); travels as a query param. */
  token: string;
  /** When provided, forwarded to the backend as `lastEventId` (replay marker). */
  lastEventId?: string;
  /** Called with every parsed, non-duplicate event. */
  onEvent: (event: unknown) => void;
  /**
   * Called with the latest server event id (the SSE `id:` field, surfaced by
   * the browser as `MessageEvent.lastEventId`) on every received frame —
   * including frames the dedup drops. The caller stores it and sends it back
   * as `lastEventId` on the next (re)connect so the DO can replay the gap.
   */
  onId?: (id: string) => void;
  /**
   * Called when the server signals that replay coverage is unprovable (the
   * client was offline longer than the bounded buffer). The caller should
   * REFETCH its query — not invalidate — so the gap is filled with fresh data
   * before replayed events are applied on top.
   */
  onReset?: () => void;
  /** Called when the underlying EventSource opens (connected). */
  onOpen?: () => void;
  /** Called when the underlying EventSource errors (drives reconnect). */
  onError?: () => void;
  /** When provided, `close()` is invoked automatically once the signal aborts. */
  signal?: AbortSignal;
}

export interface OrdersStreamHandle {
  /** Idempotent: closes the underlying EventSource and clears handlers. */
  close: () => void;
}

/**
 * Build the per-tenant stream URL. `apiBase` already includes the `/api`
 * prefix (same as apiFetch), so the stream path is `/stream/orders` — the
 * backend serves `/api/stream/orders`. The stream token travels as a query
 * parameter because EventSource cannot set custom headers; `lastEventId` is
 * forwarded when the caller has a replay marker.
 */
function buildStreamUrl(
  apiBase: string,
  tenantId: string,
  token: string,
  lastEventId?: string,
): string {
  let url =
    `${apiBase.replace(/\/+$/, '')}/stream/orders` +
    `?tenantId=${encodeURIComponent(tenantId)}&token=${encodeURIComponent(token)}`;
  if (lastEventId) url += `&lastEventId=${encodeURIComponent(lastEventId)}`;
  return url;
}

/**
 * Open the SSE orders stream.
 *
 * `token` must be a freshly minted single-use stream token from
 * `mintStreamToken()` — NEVER the 24h admin JWT (EventSource cannot set
 * headers, and the short TTL + single-use is what keeps the query-string
 * credential acceptable). On error the EventSource is closed FIRST so the
 * browser's native auto-reconnect cannot replay a burned token; the caller's
 * `onError` drives the re-mint + reopen cycle.
 */
export function openOrdersStream({
  apiBase = API_BASE,
  tenantId,
  token,
  lastEventId,
  onEvent,
  onId,
  onReset,
  onOpen,
  onError,
  signal,
}: OpenOrdersStreamOptions): OrdersStreamHandle {
  const url = buildStreamUrl(apiBase, tenantId, token, lastEventId);

  const source = new EventSource(url);
  let closed = false;

  // `event: reset` is a named frame the DO sends when replay coverage is
  // unprovable (stale marker) so the consumer refetches before applying replay.
  const handleReset = () => {
    onReset?.();
  };
  source.addEventListener('reset', handleReset);

  // Deduplicate `new-booking` events by orderId: the broadcaster may re-send
  // a booking across reconnects, and the calendar must apply it only once.
  // `connected` heartbeats (no orderId) always pass through.
  const seenKeys = new Set<string>();

  source.onmessage = (msg) => {
    // Advance the replay marker on RECEIPT — before the dedup return — or a
    // replayed duplicate would leave the marker frozen and the client would
    // re-request the same window forever.
    if (msg.lastEventId) onId?.(msg.lastEventId);
    const parsed = parseSSEEvent(msg.data);
    if (parsed === null) return;
    const orderId = (parsed as { orderId?: unknown }).orderId;
    if (typeof orderId === 'string' || typeof orderId === 'number') {
      const key = String(orderId);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
    }
    onEvent(parsed);
  };

  source.onopen = () => onOpen?.();
  source.onerror = () => {
    // Disable the browser's native auto-reconnect: the stream token is
    // single-use, so a native retry would replay a burned token against the
    // DO and 401 forever. Close, then let the hook re-mint + reopen.
    source.close();
    onError?.();
  };

  const close = (): void => {
    if (closed) return;
    closed = true;
    source.onopen = null;
    source.onmessage = null;
    source.onerror = null;
    source.removeEventListener('reset', handleReset);
    source.close();
  };

  if (signal) {
    if (signal.aborted) {
      close();
    } else {
      signal.addEventListener('abort', close, { once: true });
    }
  }

  return { close };
}

export type OpenInboxStreamOptions = OpenOrdersStreamOptions;
export type InboxStreamHandle = OrdersStreamHandle;

/**
 * Open the SSE inbox stream.
 *
 * Thin consumer of the same per-tenant endpoint as `openOrdersStream`
 * (`/stream/orders`), so a single stream URL delivers BOTH `new-booking`
 * (orderId) and `new-lead` (leadId) events. Auth, backoff, and close
 * semantics are identical to `openOrdersStream` — the token must be a freshly
 * minted single-use stream token, and on error the EventSource is closed
 * before `onError` fires so native auto-reconnect cannot replay a burned
 * token.
 *
 * Dedup policy: events are keyed by `type:id` (orderId for `new-booking`,
 * leadId for `new-lead`) so replayed frames across reconnects fire `onEvent`
 * only once. Heartbeat frames without an id (e.g. `connected`) always pass.
 * The consuming panel is still responsible for turning an event into a
 * refetch / cache invalidation.
 */
export function openInboxStream({
  apiBase = API_BASE,
  tenantId,
  token,
  lastEventId,
  onEvent,
  onId,
  onReset,
  onOpen,
  onError,
  signal,
}: OpenInboxStreamOptions): InboxStreamHandle {
  const url = buildStreamUrl(apiBase, tenantId, token, lastEventId);

  const source = new EventSource(url);
  let closed = false;

  // Same reset contract as openOrdersStream: refetch on unprovable coverage.
  const handleReset = () => {
    onReset?.();
  };
  source.addEventListener('reset', handleReset);

  // Deduplicate by event type + id so a `new-lead` and a `new-booking` that
  // happen to share a numeric id never collapse into one, while replays of
  // the same (type, id) across reconnects are applied only once.
  const seenKeys = new Set<string>();

  source.onmessage = (msg) => {
    // Marker advances on receipt, before dedup — see openOrdersStream.
    if (msg.lastEventId) onId?.(msg.lastEventId);
    const parsed = parseSSEEvent(msg.data);
    if (parsed === null) return;
    const event = parsed as { type?: unknown; orderId?: unknown; leadId?: unknown };
    const id =
      typeof event.orderId === 'string' || typeof event.orderId === 'number'
        ? event.orderId
        : typeof event.leadId === 'string' || typeof event.leadId === 'number'
          ? event.leadId
          : null;
    if (id !== null) {
      const key = `${String(event.type ?? '')}:${String(id)}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
    }
    onEvent(parsed);
  };

  source.onopen = () => onOpen?.();
  source.onerror = () => {
    // Same single-use rationale as openOrdersStream: close BEFORE the hook's
    // onError so the browser never auto-reconnects onto a burned token.
    source.close();
    onError?.();
  };

  const close = (): void => {
    if (closed) return;
    closed = true;
    source.onopen = null;
    source.onmessage = null;
    source.onerror = null;
    source.removeEventListener('reset', handleReset);
    source.close();
  };

  if (signal) {
    if (signal.aborted) {
      close();
    } else {
      signal.addEventListener('abort', close, { once: true });
    }
  }

  return { close };
}
