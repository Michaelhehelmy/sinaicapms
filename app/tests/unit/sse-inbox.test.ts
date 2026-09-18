import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { parseSSEEvent, openInboxStream } from '@/lib/sse';
import { useSseInbox } from '@/hooks/useSseInbox';

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
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
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

describe('parseSSEEvent (inbox payloads)', () => {
  it('parses a new-lead frame', () => {
    expect(parseSSEEvent('data: {"type":"new-lead","leadId":"l1","name":"Ada","subject":"Hi"}')).toEqual({
      type: 'new-lead',
      leadId: 'l1',
      name: 'Ada',
      subject: 'Hi',
    });
  });

  it('parses a new-booking frame alongside a new-lead', () => {
    expect(parseSSEEvent('data: {"type":"new-booking","orderId":42,"campId":1}')).toEqual({
      type: 'new-booking',
      orderId: 42,
      campId: 1,
    });
  });

  it('returns null for non-data lines and malformed JSON', () => {
    expect(parseSSEEvent('event: lead')).toBeNull();
    expect(parseSSEEvent('data: {not json')).toBeNull();
  });
});

describe('openInboxStream', () => {
  const API = 'http://localhost:8787/api/v1';

  it('connects to the same per-tenant /stream/orders URL as orders', () => {
    openInboxStream({
      apiBase: API,
      tenantId: 'my camp',
      token: 'tok/1',
      onEvent: () => {},
    });
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe(
      'http://localhost:8787/api/v1/stream/orders?tenantId=my%20camp&token=tok%2F1',
    );
  });

  it('never double-prefixes /api and strips a trailing slash from apiBase', () => {
    openInboxStream({
      apiBase: 'http://localhost:8787/api/',
      tenantId: 't1',
      token: 'tok',
      onEvent: () => {},
    });
    expect(FakeEventSource.instances[0].url).toBe(
      'http://localhost:8787/api/stream/orders?tenantId=t1&token=tok',
    );
  });

  it('defaults apiBase to API_BASE from api.ts', () => {
    openInboxStream({ tenantId: 't1', token: 'tok', onEvent: () => {} });
    expect(FakeEventSource.instances[0].url).toContain('http://localhost:8787/api/v1/stream/orders');
  });

  it('forwards new-lead and new-booking events to onEvent', () => {
    const onEvent = vi.fn();
    openInboxStream({ apiBase: API, tenantId: 't1', token: 'tok', onEvent });
    const es = FakeEventSource.instances[0];

    es.onmessage?.({ data: 'data: {"type":"new-lead","leadId":"l1","name":"Ada"}' });
    es.onmessage?.({ data: 'data: {"type":"new-booking","orderId":9,"campId":2}' });
    es.onmessage?.({ data: 'data: {"type":"connected"}' });

    expect(onEvent).toHaveBeenCalledTimes(3);
    expect(onEvent).toHaveBeenCalledWith({ type: 'new-lead', leadId: 'l1', name: 'Ada' });
    expect(onEvent).toHaveBeenCalledWith({ type: 'new-booking', orderId: 9, campId: 2 });
  });

  it('ignores malformed frames without calling onEvent', () => {
    const onEvent = vi.fn();
    openInboxStream({ apiBase: API, tenantId: 't1', token: 'tok', onEvent });
    FakeEventSource.instances[0].onmessage?.({ data: 'not a frame' });
    FakeEventSource.instances[0].onmessage?.({ data: 'data: ' });
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('deduplicates by type + id while letting key-less events pass', () => {
    const onEvent = vi.fn();
    openInboxStream({ apiBase: API, tenantId: 't1', token: 'tok', onEvent });
    const es = FakeEventSource.instances[0];
    const lead = (leadId: number | string) =>
      `data: ${JSON.stringify({ type: 'new-lead', leadId, name: 'X' })}`;
    const booking = (orderId: number | string) =>
      `data: ${JSON.stringify({ type: 'new-booking', orderId, campId: 1 })}`;

    es.onmessage?.({ data: lead(5) }); // lead 5 — fires
    es.onmessage?.({ data: lead(5) }); // duplicate lead 5 — skipped
    es.onmessage?.({ data: booking(5) }); // booking 5 — fires (different type key)
    es.onmessage?.({ data: booking(5) }); // duplicate booking 5 — skipped
    es.onmessage?.({ data: lead('7') }); // lead 7 — fires
    es.onmessage?.({ data: 'data: {"type":"connected"}' }); // no id — passes
    es.onmessage?.({ data: 'data: {"type":"connected"}' }); // no id — passes again

    expect(onEvent).toHaveBeenCalledTimes(5);
  });

  it('close is idempotent and clears all handlers', () => {
    const { close } = openInboxStream({
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
    openInboxStream({
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

  it('closes immediately when the signal is already aborted at open time', () => {
    const controller = new AbortController();
    controller.abort();
    const onEvent = vi.fn();

    const { close } = openInboxStream({
      apiBase: API,
      tenantId: 't1',
      token: 'tok',
      onEvent,
      signal: controller.signal,
    });

    // The stream is created and immediately torn down — never open, no handlers.
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED);
    expect(FakeEventSource.instances[0].onmessage).toBeNull();
    expect(onEvent).not.toHaveBeenCalled();
    // close() on the already-closed handle is a safe no-op.
    close();
  });
});

describe('useSseInbox', () => {
  const baseProps = {
    enabled: true,
    tenantId: 't1',
    token: 'tok',
    apiBase: 'http://localhost:8787/api',
    onEvent: vi.fn(),
  };

  it('does not open a stream when disabled', () => {
    const { result } = renderHook(() => useSseInbox({ ...baseProps, enabled: false }));
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.connected).toBe(false);
  });

  it('does not open a stream when the token is missing', () => {
    const { result } = renderHook(() => useSseInbox({ ...baseProps, token: undefined }));
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.connected).toBe(false);
  });

  it('does not open a stream when tenantId is missing', () => {
    const { result } = renderHook(() => useSseInbox({ ...baseProps, tenantId: undefined }));
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.connected).toBe(false);
  });

  it('mints a stream token and opens the inbox stream with it (never the admin JWT)', async () => {
    const { result } = renderHook(() => useSseInbox(baseProps));
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
    const { result } = renderHook(() => useSseInbox(baseProps));
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
    const { result } = renderHook(() => useSseInbox(baseProps));
    await flush();
    act(() => {
      FakeEventSource.instances[0].onopen?.();
    });
    expect(result.current.connected).toBe(true);
  });

  it('forwards parsed events to onEvent', async () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() => useSseInbox({ ...baseProps, onEvent }));
    await flush();
    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: 'data: {"type":"new-lead","leadId":"l1","name":"Ada"}',
      });
    });
    expect(result.current.connected).toBe(false); // no onopen yet
    expect(onEvent).toHaveBeenCalledWith({ type: 'new-lead', leadId: 'l1', name: 'Ada' });
  });

  it('uses the latest onEvent callback across renders without reopening', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook((props) => useSseInbox(props), {
      initialProps: { ...baseProps, onEvent: first },
    });
    await flush();

    rerender({ ...baseProps, onEvent: second });

    expect(FakeEventSource.instances).toHaveLength(1);
    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: 'data: {"type":"new-booking","orderId":42,"campId":1}',
      });
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ type: 'new-booking', orderId: 42, campId: 1 });
  });

  it('reconnects on error with exponential backoff capped at 30s', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSseInbox(baseProps));
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
    const { unmount } = renderHook(() => useSseInbox(baseProps));
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
    const { result, rerender } = renderHook((props) => useSseInbox(props), {
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
    const { rerender } = renderHook((props) => useSseInbox(props), {
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
    const { rerender } = renderHook((props) => useSseInbox(props), {
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
    renderHook(() => useSseInbox({ ...baseProps, lastEventId: 'evt_9' }));
    await flush();
    expect(FakeEventSource.instances[0].url).toContain('lastEventId=evt_9');
  });

  it('stops and calls onAuthError on a mint 401 (hard failure)', async () => {
    fetchMock.mockResolvedValue(mintFail(401, 'Session expired or invalid signature'));
    const onAuthError = vi.fn();
    const { result } = renderHook(() => useSseInbox({ ...baseProps, onAuthError }));
    await flush();

    expect(onAuthError).toHaveBeenCalledTimes(1);
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(result.current.connected).toBe(false);
  });

  it('stops and calls onAuthError on a mint 403 (hard failure)', async () => {
    fetchMock.mockResolvedValue(mintFail(403, 'Forbidden: admin role required'));
    const onAuthError = vi.fn();
    const { result } = renderHook(() => useSseInbox({ ...baseProps, onAuthError }));
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
    const { result } = renderHook(() => useSseInbox({ ...baseProps, onAuthError }));
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
    const { result } = renderHook(() => useSseInbox({ ...baseProps, onAuthError }));
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
