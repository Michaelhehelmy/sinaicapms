/**
 * React hook that keeps a live SSE orders stream open for a tenant admin
 * dashboard (consumed by the booking calendar wiring task).
 *
 * - `enabled=false`, a missing `token`, or a missing `tenantId` → no stream,
 *   `connected=false`.
 * - Opens the stream once per (enabled, tenantId, token, apiBase) identity.
 * - Auto-reconnects on error with exponential backoff (3s first attempt,
 *   capped at 10s) as long as the hook stays enabled.
 * - Cleans up on unmount / disable: closes the stream and clears the
 *   reconnect timer. Never throws — failures surface as `connected=false`
 *   plus automatic retries.
 */

import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api';
import { openOrdersStream, type OrdersStreamHandle } from '@/lib/sse';

export interface UseSseOrdersOptions {
  /** When false the stream is not opened (e.g., calendar page not visible). */
  enabled: boolean;
  /** Tenant whose bookings should be streamed. */
  tenantId?: string;
  /** Short-lived admin JWT; stream is skipped when missing. */
  token?: string;
  /** API base including the `/api` prefix; defaults to `API_BASE` from api.ts. */
  apiBase?: string;
  /** Called with every parsed, non-duplicate event. */
  onEvent: (event: unknown) => void;
}

export interface UseSseOrdersResult {
  /** True once the underlying EventSource has opened. */
  connected: boolean;
}

export function useSseOrders({
  enabled,
  tenantId,
  token,
  apiBase = API_BASE,
  onEvent,
}: UseSseOrdersOptions): UseSseOrdersResult {
  const [connected, setConnected] = useState(false);

  // The stream handle and reconnect timer survive re-renders. The latest
  // onEvent is kept in a ref so the effect never needs to re-run (and
  // re-open the stream) just because the caller's callback identity changed.
  const streamRef = useRef<OrdersStreamHandle | null>(null);
  const timerRef = useRef<number | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !token || !tenantId) {
      setConnected(false);
      return;
    }

    let attempt = 0;
    const BASE_DELAY_MS = 3000;
    const MAX_DELAY_MS = 10000;

    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const closeStream = () => {
      if (streamRef.current) {
        streamRef.current.close();
        streamRef.current = null;
      }
    };

    function connect() {
      clearTimer();
      closeStream();
      streamRef.current = openOrdersStream({
        apiBase,
        tenantId,
        token,
        onEvent: (event) => onEventRef.current(event),
        onOpen: () => setConnected(true),
        onError: scheduleReconnect,
      });
    }

    function scheduleReconnect() {
      setConnected(false);
      clearTimer();
      const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
      attempt += 1;
      timerRef.current = window.setTimeout(connect, delay);
    }

    connect();

    return () => {
      clearTimer();
      closeStream();
      setConnected(false);
    };
  }, [enabled, tenantId, token, apiBase]);

  return { connected };
}
