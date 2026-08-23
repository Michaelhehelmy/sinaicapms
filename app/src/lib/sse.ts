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
 * EventSource cannot set custom headers, so the short-lived admin JWT is
 * passed as a `token` query parameter. This is acceptable because the stream
 * is served over HTTPS in production and the JWT expires quickly.
 */

import { API_BASE } from './api';

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
  /** Short-lived admin JWT; travels as a query param (EventSource cannot set headers). */
  token: string;
  /** Called with every parsed, non-duplicate event. */
  onEvent: (event: unknown) => void;
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
 * backend serves `/api/stream/orders`. The token travels as a query parameter
 * because EventSource cannot set custom headers.
 */
function buildStreamUrl(apiBase: string, tenantId: string, token: string): string {
  return (
    `${apiBase.replace(/\/+$/, '')}/stream/orders` +
    `?tenantId=${encodeURIComponent(tenantId)}&token=${encodeURIComponent(token)}`
  );
}

/**
 * Open the SSE orders stream.
 *
 * The token travels as a query parameter because EventSource cannot set
 * custom headers; acceptable over HTTPS since the JWT is short-lived.
 */
export function openOrdersStream({
  apiBase = API_BASE,
  tenantId,
  token,
  onEvent,
  onOpen,
  onError,
  signal,
}: OpenOrdersStreamOptions): OrdersStreamHandle {
  const url = buildStreamUrl(apiBase, tenantId, token);

  const source = new EventSource(url);
  let closed = false;

  // Deduplicate `new-booking` events by orderId: the broadcaster may re-send
  // a booking across reconnects, and the calendar must apply it only once.
  // `connected` heartbeats (no orderId) always pass through.
  const seenKeys = new Set<string>();

  source.onmessage = (msg) => {
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
  source.onerror = () => onError?.();

  const close = (): void => {
    if (closed) return;
    closed = true;
    source.onopen = null;
    source.onmessage = null;
    source.onerror = null;
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
 * semantics are identical to `openOrdersStream`.
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
  onEvent,
  onOpen,
  onError,
  signal,
}: OpenInboxStreamOptions): InboxStreamHandle {
  const url = buildStreamUrl(apiBase, tenantId, token);

  const source = new EventSource(url);
  let closed = false;

  // Deduplicate by event type + id so a `new-lead` and a `new-booking` that
  // happen to share a numeric id never collapse into one, while replays of
  // the same (type, id) across reconnects are applied only once.
  const seenKeys = new Set<string>();

  source.onmessage = (msg) => {
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
  source.onerror = () => onError?.();

  const close = (): void => {
    if (closed) return;
    closed = true;
    source.onopen = null;
    source.onmessage = null;
    source.onerror = null;
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
