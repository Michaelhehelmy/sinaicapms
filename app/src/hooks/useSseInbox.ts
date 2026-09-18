/**
 * React hook that keeps a live SSE inbox stream open for a tenant admin.
 *
 * The backend stream endpoint is per-tenant and generic: the same
 * `/stream/orders` URL delivers both `new-booking` and `new-lead` events.
 * This hook is the inbox flavor of `useSseOrders` and mirrors its behavior:
 *
 * - `enabled=false`, a missing `token`, or a missing `tenantId` → no stream,
 *   `connected=false`.
 * - Opens the stream once per (enabled, tenantId, token, apiBase) identity.
 * - Wave 3.4a (F-A16-02): the stream credential is minted fresh via
 *   POST /api/stream/token before EVERY connect/reconnect — the 24h admin JWT
 *   never rides the SSE URL. Minting is classified:
 *     401/403 → HARD failure — stop reconnecting, call `onAuthError`, stay
 *               disconnected (no spin).
 *     network/5xx/timeout → AMBIGUOUS — one immediate retry-on-backoff; a
 *               second consecutive ambiguous mint failure escalates to hard.
 * - Errors AFTER a successful open (EventSource `error`) are TRANSIENT →
 *   exponential backoff (3s first attempt, capped at 30s).
 * - On EventSource error the underlying source is closed first (the stream
 *   token is single-use — the browser's native auto-reconnect would replay a
 *   burned token and 401 forever); this hook re-mints and reopens instead.
 * - Cleans up on unmount / disable: closes the stream and clears the
 *   reconnect timer. Never throws — failures surface as `connected=false`.
 *
 * Dedup policy: `openInboxStream` dedups events by `type:id` (orderId for
 * `new-booking`, leadId for `new-lead`) so replayed frames across reconnects
 * fire `onEvent` only once. The inbox panel is still responsible for turning
 * an event into a refetch / cache invalidation.
 */

import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api';
import { mintStreamToken, StreamTokenMintError } from '@/lib/sse';
import { openInboxStream, type InboxStreamHandle } from '@/lib/sse';

export interface UseSseInboxOptions {
  /** When false the stream is not opened (e.g., inbox panel not visible). */
  enabled: boolean;
  /** Tenant whose inbox events should be streamed. */
  tenantId?: string;
  /** Short-lived admin JWT used ONLY to mint the stream token (never on the URL). */
  token?: string;
  /** API base including the `/api` prefix; defaults to `API_BASE` from api.ts. */
  apiBase?: string;
  /** When provided, forwarded to the backend as `lastEventId` on (re)connects. */
  lastEventId?: string;
  /** Called with every parsed, non-duplicate event. */
  onEvent: (event: unknown) => void;
  /**
   * Called when the hook gives up on the stream: a mint 401/403, or two
   * consecutive ambiguous mint failures. Consumers should clear the admin
   * session or surface auth expiry — the hook does NOT spin in this state.
   */
  onAuthError?: () => void;
}

export interface UseSseInboxResult {
  /** True once the underlying EventSource has opened. */
  connected: boolean;
}

const BASE_DELAY_MS = 3000;
const MAX_DELAY_MS = 30000;
const AMBIGUOUS_MINT_RETRY_DELAY_MS = 3000;

export function useSseInbox({
  enabled,
  tenantId,
  token,
  apiBase = API_BASE,
  lastEventId,
  onEvent,
  onAuthError,
}: UseSseInboxOptions): UseSseInboxResult {
  const [connected, setConnected] = useState(false);

  // The stream handle and reconnect timer survive re-renders. The latest
  // onEvent/onAuthError are kept in refs so the effect never needs to re-run
  // (and re-open the stream) just because a caller callback identity changed.
  const streamRef = useRef<InboxStreamHandle | null>(null);
  const timerRef = useRef<number | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onAuthErrorRef = useRef(onAuthError);
  onAuthErrorRef.current = onAuthError;

  useEffect(() => {
    if (!enabled || !token || !tenantId) {
      setConnected(false);
      return;
    }

    // Capture narrowed values — TS does not propagate `!token`/`!tenantId`
    // narrowing into the nested `connect` closure below.
    const activeToken = token;
    const activeTenantId = tenantId;
    const activeLastEventId = lastEventId;

    let attempt = 0;
    let consecutiveMintFailures = 0;

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

    // Hard failure: stop the reconnect loop entirely and surface the auth
    // problem. The hook stays disconnected — no timers, no spinning.
    const failHard = () => {
      setConnected(false);
      clearTimer();
      closeStream();
      onAuthErrorRef.current?.();
    };

    async function connect() {
      clearTimer();
      closeStream();
      setConnected(false);

      let streamToken: string;
      try {
        const minted = await mintStreamToken(apiBase, activeToken);
        streamToken = minted.token;
        consecutiveMintFailures = 0;
      } catch (err) {
        const status = err instanceof StreamTokenMintError ? err.status : 0;
        if (status === 401 || status === 403) {
          // Hard: the admin session itself is rejected/expired.
          failHard();
          return;
        }
        // Ambiguous (network / timeout / 5xx): retry once on a short
        // backoff; a second CONSECUTIVE ambiguous mint escalation is hard.
        consecutiveMintFailures += 1;
        if (consecutiveMintFailures >= 2) {
          failHard();
          return;
        }
        setConnected(false);
        timerRef.current = window.setTimeout(connect, AMBIGUOUS_MINT_RETRY_DELAY_MS);
        return;
      }

      streamRef.current = openInboxStream({
        apiBase,
        tenantId: activeTenantId,
        token: streamToken,
        lastEventId: activeLastEventId,
        onEvent: (event) => onEventRef.current(event),
        onOpen: () => setConnected(true),
        onError: scheduleReconnect,
      });
    }

    // Transient failure AFTER a successful open → exponential backoff.
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
  }, [enabled, tenantId, token, apiBase, lastEventId]);

  return { connected };
}