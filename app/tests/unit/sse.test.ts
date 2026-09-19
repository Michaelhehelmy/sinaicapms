import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { parseSSEEvent, openOrdersStream } from '@/lib/sse';
import { useSseOrders } from '@/hooks/useSseOrders';

/**
 * Minimal EventSource double with the exact shape the app touches.
 * The real browser EventSource is replaced per test; jsdom has none.
 */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string; lastEventId?: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  listeners: Record<string, Array<(event: unknown) => void>> = {};

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (event: unknown) => void) {
    (this.listeners[type] ||= []).push(handler);
  }

  removeEventListener(type: string, handler: (event: unknown) => void) {
    this.listeners[type] = (this.listeners[type] || []).filter((h) => h !== handler);
  }

  /** Test helper: emit a named SSE event (e.g. `reset`). */
  emit(type: string, event: unknown = {}) {
    for (const handler of this.listeners[type] || []) handler(event);
  }

  close() {
    this.readyState = 2;
  }
}

// ── Mint helpers (Wave 3.4a, F-A16-02) ─────────────────────────────────
// The hooks now exchange the admin JWT for a short-lived single-use stream
// token BEFORE every connect, so tests mock POST /api/stream/token.
function mintOk(token: string): Response {
  return {
    ok: true,
    status: 201,
    json: async () => ({ token, expiresIn: 60, type: 'stream' }),
  } as unknown as Response;
}

function mintFail(status: number, error = 'mint failed'): Response {
  return {
    ok: false,
    status,
    json: async () => ({ error }),
  } as unknown as Response;
}

/** Flush the async mint promise so the EventSource is (or is not) opened. */
async function flush() {
  await act(async () => {});
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  FakeEventSource.instances = [];
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
  fetchMock = vi.fn().mockResolvedValue(mintOk('stream-tok'));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  delete (globalThis as any).EventSource;
  delete (globalThis as any).fetch;
  vi.useRealTimers();
});

describe('parseSSEEvent', () => {
  it('parses a valid data frame', () => {
    expect(parseSSEEvent('data: {"type":"connected"}')).toEqual({ type: 'connected' });
  });

  it('ignores surrounding whitespace and trailing newlines', () => {
    expect(parseSSEEvent('  data: {"type":"new-booking","orderId":1}  \n\n')).toEqual({
      type: 'new-booking',
      orderId: 1,
    });
  });

  it('returns null for non-data lines and empty input', () => {
    expect(parseSSEEvent('event: ping')).toBeNull();
    expect(parseSSEEvent('')).toBeNull();
    expect(parseSSEEvent('   ')).toBeNull();
  });

  it('returns null when the data payload is empty', () => {
    expect(parseSSEEvent('data:')).toBeNull();
    expect(parseSSEEvent('data:   ')).toBeNull();
  });

  it('returns null for malformed JSON instead of throwing', () => {
    expect(parseSSEEvent('data: {not json')).toBeNull();
    expect(parseSSEEvent('data: undefined')).toBeNull();
  });
});

describe('openOrdersStream', () => {
  const API = 'http://localhost:8787/api/v1';

  it('connects to the encoded stream URL', () => {
    openOrdersStream({
      apiBase: API,
      tenantId: 'my camp',
      token: 'tok/123',
      onEvent: () => {},
    });
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe(
      'http://localhost:8787/api/v1/stream/orders?tenantId=my%20camp&token=tok%2F123',
    );
  });

  it('defaults apiBase to API_BASE from api.ts', () => {
    openOrdersStream({ tenantId: 't1', token: 'tok', onEvent: () => {} });
    expect(FakeEventSource.instances[0].url).toContain('http://localhost:8787/api/v1/stream/orders');
  });

  it('calls onEvent with parsed message data', () => {
    const onEvent = vi.fn();
    openOrdersStream({ apiBase: API, tenantId: 't1', token: 'tok', onEvent });
    FakeEventSource.instances[0].onmessage?.({ data: 'data: {"type":"connected"}' });
    expect(onEvent).toHaveBeenCalledWith({ type: 'connected' });
  });

  it('ignores malformed frames without calling onEvent', () => {
    const onEvent = vi.fn();
    openOrdersStream({ apiBase: API, tenantId: 't1', token: 'tok', onEvent });
    FakeEventSource.instances[0].onmessage?.({ data: 'not a frame' });
    FakeEventSource.instances[0].onmessage?.({ data: 'data: ' });
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('deduplicates events by orderId while letting key-less events pass', () => {
    const onEvent = vi.fn();
    openOrdersStream({ apiBase: API, tenantId: 't1', token: 'tok', onEvent });
    const es = FakeEventSource.instances[0];
    const booking = (orderId: number | string) =>
      `data: ${JSON.stringify({ type: 'new-booking', orderId, campId: 1 })}`;

    es.onmessage?.({ data: booking(5) }); // number key — first time fires
    es.onmessage?.({ data: booking(5) }); // duplicate number key — skipped
    es.onmessage?.({ data: booking('7') }); // string key — fires
    es.onmessage?.({ data: booking('7') }); // duplicate string key — skipped
    es.onmessage?.({ data: 'data: {"type":"connected"}' }); // no key — passes
    es.onmessage?.({ data: 'data: {"type":"unknown"}' }); // no key — passes

    expect(onEvent).toHaveBeenCalledTimes(4);
  });

  it('close is idempotent and clears all handlers', () => {
    const { close } = openOrdersStream({
      apiBase: API,
      tenantId: 't1',
      token: 'tok',
      onEvent: () => {},
      onOpen: () => {},
      onError: () => {},
    });
    const es = FakeEventSource.instances[0];
    const closeSpy = vi.spyOn(es, 'close');

    close();
    close();

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(es.readyState).toBe(FakeEventSource.CLOSED);
    expect(es.onmessage).toBeNull();
    expect(es.onopen).toBeNull();
    expect(es.onerror).toBeNull();
  });

  it('closes the stream when the abort signal fires', () => {
    const controller = new AbortController();
    openOrdersStream({
      apiBase: API,
      tenantId: 't1',
      token: 'tok',
      onEvent: () => {},
      signal: controller.signal,
    });
    const es = FakeEventSource.instances[0];

    controller.abort();

    expect(es.readyState).toBe(FakeEventSource.CLOSED);
    expect(es.onmessage).toBeNull();
  });

  it('closes immediately when the signal is already aborted', () => {
    const controller = new AbortController();
    controller.abort();
    openOrdersStream({
      apiBase: API,
      tenantId: 't1',
      token: 'tok',
      onEvent: () => {},
      signal: controller.signal,
    });
    expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED);
  });
});

describe('useSseOrders', () => {
  const baseProps = {
    enabled: true,
    tenantId: 't1',
    token: 'tok',
    apiBase: 'http://localhost:8787/api',
    onEvent: vi.fn(),
  };

  it('does not open a stream when disabled', () => {
    const { result } = renderHook(() => useSseOrders({ ...baseProps, enabled: false }));
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.connected).toBe(false);
  });

  it('does not open a stream when the token is missing', () => {
    const { result } = renderHook(() =>
      useSseOrders({ ...baseProps, token: undefined }),
    );
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.connected).toBe(false);
  });

  it('does not open a stream when tenantId is missing', () => {
    const { result } = renderHook(() =>
      useSseOrders({ ...baseProps, tenantId: undefined }),
    );
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.connected).toBe(false);
  });

  it('mints a stream token and opens the stream with it (never the admin JWT)', async () => {
    const { result } = renderHook(() => useSseOrders(baseProps));
    expect(FakeEventSource.instances).toHaveLength(0);

    await flush();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8787/api/stream/token',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer tok' },
      }),
    );
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe(
      'http://localhost:8787/api/stream/orders?tenantId=t1&token=stream-tok',
    );
    expect(result.current.connected).toBe(false);
  });

  it('re-mints a fresh stream token before every reconnect (owner test #8)', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(mintOk('stream-tok-1'))
      .mockResolvedValueOnce(mintOk('stream-tok-2'));
    const { result } = renderHook(() => useSseOrders(baseProps));
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toContain('token=stream-tok-1');

    act(() => {
      FakeEventSource.instances[0].onerror?.();
    });
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[1].url).toContain('token=stream-tok-2');
    expect(result.current.connected).toBe(false);
  });

  it('reports connected once the stream opens', async () => {
    const { result } = renderHook(() => useSseOrders(baseProps));
    await flush();
    act(() => {
      FakeEventSource.instances[0].onopen?.();
    });
    expect(result.current.connected).toBe(true);
  });

  it('forwards parsed events to onEvent', async () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() => useSseOrders({ ...baseProps, onEvent }));
    await flush();
    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: 'data: {"type":"new-booking","orderId":42,"campId":1}',
      });
    });
    expect(onEvent).toHaveBeenCalledWith({ type: 'new-booking', orderId: 42, campId: 1 });
  });

  it('uses the latest onEvent callback across renders without reopening', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook((props) => useSseOrders(props), {
      initialProps: { ...baseProps, onEvent: first },
    });
    await flush();

    rerender({ ...baseProps, onEvent: second });

    expect(FakeEventSource.instances).toHaveLength(1);
    act(() => {
      FakeEventSource.instances[0].onmessage?.({ data: 'data: {"type":"connected"}' });
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ type: 'connected' });
  });

  it('reconnects on error with exponential backoff capped at 30s', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSseOrders(baseProps));
    await flush();
    expect(FakeEventSource.instances).toHaveLength(1);

    act(() => {
      FakeEventSource.instances[0].onerror?.();
    });
    expect(result.current.connected).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(3000); // 1st retry after 3s
    });
    await flush();
    expect(FakeEventSource.instances).toHaveLength(2);

    act(() => {
      FakeEventSource.instances[1].onerror?.();
    });
    await act(async () => {
      vi.advanceTimersByTime(6000); // 2nd retry after 6s
    });
    await flush();
    expect(FakeEventSource.instances).toHaveLength(3);

    act(() => {
      FakeEventSource.instances[2].onerror?.();
    });
    await act(async () => {
      vi.advanceTimersByTime(12000); // 3rd retry after 12s
    });
    await flush();
    expect(FakeEventSource.instances).toHaveLength(4);

    act(() => {
      FakeEventSource.instances[3].onerror?.();
    });
    await act(async () => {
      vi.advanceTimersByTime(24000); // 4th retry after 24s
    });
    await flush();
    expect(FakeEventSource.instances).toHaveLength(5);

    act(() => {
      FakeEventSource.instances[4].onerror?.();
    });
    await act(async () => {
      vi.advanceTimersByTime(30000); // 5th retry capped at 30s
    });
    await flush();
    expect(FakeEventSource.instances).toHaveLength(6);
  });

  it('closes the stream on unmount and clears pending reconnects', async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useSseOrders(baseProps));
    await flush();
    const es = FakeEventSource.instances[0];
    const closeSpy = vi.spyOn(es, 'close');

    act(() => {
      es.onerror?.(); // schedule a reconnect
    });
    unmount();

    expect(closeSpy).toHaveBeenCalled();
    expect(es.readyState).toBe(FakeEventSource.CLOSED);

    await act(async () => {
      vi.advanceTimersByTime(60000); // no reconnect may fire after unmount
    });
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('closes the stream when enabled flips to false and reopens when re-enabled', async () => {
    const { result, rerender } = renderHook((props) => useSseOrders(props), {
      initialProps: baseProps,
    });
    await flush();
    expect(FakeEventSource.instances).toHaveLength(1);

    rerender({ ...baseProps, enabled: false });
    expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED);
    expect(result.current.connected).toBe(false);

    rerender({ ...baseProps, enabled: true });
    await flush();
    expect(FakeEventSource.instances).toHaveLength(2); // fresh stream
  });

  it('opens a new stream when tenantId changes', async () => {
    const { rerender } = renderHook((props) => useSseOrders(props), {
      initialProps: baseProps,
    });
    await flush();
    expect(FakeEventSource.instances).toHaveLength(1);

    rerender({ ...baseProps, tenantId: 't2' });
    await flush();
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED);
    expect(FakeEventSource.instances[1].url).toContain('tenantId=t2');
  });

  it('re-mints when the admin token prop changes', async () => {
    const { rerender } = renderHook((props) => useSseOrders(props), {
      initialProps: baseProps,
    });
    await flush();
    expect(FakeEventSource.instances).toHaveLength(1);

    rerender({ ...baseProps, token: 'new-admin-tok' });
    await flush();
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED);
    expect(FakeEventSource.instances[1].url).toContain('token=stream-tok');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8787/api/stream/token',
      expect.objectContaining({ headers: { Authorization: 'Bearer new-admin-tok' } }),
    );
  });

  it('appends lastEventId to the stream URL', async () => {
    renderHook(() => useSseOrders({ ...baseProps, lastEventId: 'evt_9' }));
    await flush();
    expect(FakeEventSource.instances[0].url).toContain('lastEventId=evt_9');
  });

  it('stops and calls onAuthError on a mint 401 (hard failure)', async () => {
    fetchMock.mockResolvedValue(mintFail(401, 'Session expired or invalid signature'));
    const onAuthError = vi.fn();
    const { result } = renderHook(() => useSseOrders({ ...baseProps, onAuthError }));
    await flush();

    expect(onAuthError).toHaveBeenCalledTimes(1);
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(result.current.connected).toBe(false);
  });

  it('stops and calls onAuthError on a mint 403 (hard failure)', async () => {
    fetchMock.mockResolvedValue(mintFail(403, 'Forbidden: admin role required'));
    const onAuthError = vi.fn();
    const { result } = renderHook(() => useSseOrders({ ...baseProps, onAuthError }));
    await flush();

    expect(onAuthError).toHaveBeenCalledTimes(1);
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(result.current.connected).toBe(false);
  });

  it('retries an ambiguous mint failure on a short backoff then succeeds', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(mintOk('stream-tok-1'));
    const onAuthError = vi.fn();
    const { result } = renderHook(() => useSseOrders({ ...baseProps, onAuthError }));
    await flush();

    expect(onAuthError).not.toHaveBeenCalled();
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(result.current.connected).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(3000); // ambiguous retry delay
    });
    await flush();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toContain('token=stream-tok-1');
    expect(onAuthError).not.toHaveBeenCalled();
  });

  it('escalates to hard after two consecutive ambiguous mint failures', async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const onAuthError = vi.fn();
    const { result } = renderHook(() => useSseOrders({ ...baseProps, onAuthError }));
    await flush();

    expect(onAuthError).not.toHaveBeenCalled();
    expect(FakeEventSource.instances).toHaveLength(0);

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    await flush();
    expect(onAuthError).toHaveBeenCalledTimes(1);
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(result.current.connected).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(60000);
    });
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});
