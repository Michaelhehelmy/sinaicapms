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

beforeEach(() => {
  FakeEventSource.instances = [];
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
});

afterEach(() => {
  delete globalThis.EventSource;
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
  const API = 'http://localhost:8787/api';

  it('connects to the encoded stream URL', () => {
    openOrdersStream({
      apiBase: API,
      tenantId: 'my camp',
      token: 'tok/123',
      onEvent: () => {},
    });
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe(
      'http://localhost:8787/api/stream/orders?tenantId=my%20camp&token=tok%2F123',
    );
  });

  it('defaults apiBase to API_BASE from api.ts', () => {
    openOrdersStream({ tenantId: 't1', token: 'tok', onEvent: () => {} });
    expect(FakeEventSource.instances[0].url).toContain('http://localhost:8787/api/stream/orders');
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
    expect(result.current.connected).toBe(false);
  });

  it('does not open a stream when the token is missing', () => {
    const { result } = renderHook(() =>
      useSseOrders({ ...baseProps, token: undefined }),
    );
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(result.current.connected).toBe(false);
  });

  it('does not open a stream when tenantId is missing', () => {
    const { result } = renderHook(() =>
      useSseOrders({ ...baseProps, tenantId: undefined }),
    );
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(result.current.connected).toBe(false);
  });

  it('opens a stream when enabled with tenant and token', () => {
    const { result } = renderHook(() => useSseOrders(baseProps));
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe(
      'http://localhost:8787/api/stream/orders?tenantId=t1&token=tok',
    );
    expect(result.current.connected).toBe(false);
  });

  it('reports connected once the stream opens', () => {
    const { result } = renderHook(() => useSseOrders(baseProps));
    act(() => {
      FakeEventSource.instances[0].onopen?.();
    });
    expect(result.current.connected).toBe(true);
  });

  it('forwards parsed events to onEvent', () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() => useSseOrders({ ...baseProps, onEvent }));
    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: 'data: {"type":"new-booking","orderId":42,"campId":1}',
      });
    });
    expect(onEvent).toHaveBeenCalledWith({ type: 'new-booking', orderId: 42, campId: 1 });
  });

  it('uses the latest onEvent callback across renders without reopening', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook((props) => useSseOrders(props), {
      initialProps: { ...baseProps, onEvent: first },
    });

    rerender({ ...baseProps, onEvent: second });

    expect(FakeEventSource.instances).toHaveLength(1);
    act(() => {
      FakeEventSource.instances[0].onmessage?.({ data: 'data: {"type":"connected"}' });
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ type: 'connected' });
  });

  it('reconnects on error with exponential backoff capped at 10s', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSseOrders(baseProps));
    expect(FakeEventSource.instances).toHaveLength(1);

    act(() => {
      FakeEventSource.instances[0].onerror?.();
    });
    expect(result.current.connected).toBe(false);

    act(() => {
      vi.advanceTimersByTime(3000); // 1st retry after 3s
    });
    expect(FakeEventSource.instances).toHaveLength(2);

    act(() => {
      FakeEventSource.instances[1].onerror?.();
    });
    act(() => {
      vi.advanceTimersByTime(6000); // 2nd retry after 6s
    });
    expect(FakeEventSource.instances).toHaveLength(3);

    act(() => {
      FakeEventSource.instances[2].onerror?.();
    });
    act(() => {
      vi.advanceTimersByTime(10000); // 3rd retry capped at 10s
    });
    expect(FakeEventSource.instances).toHaveLength(4);
  });

  it('closes the stream on unmount and clears pending reconnects', () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useSseOrders(baseProps));
    const es = FakeEventSource.instances[0];
    const closeSpy = vi.spyOn(es, 'close');

    act(() => {
      es.onerror?.(); // schedule a reconnect
    });
    unmount();

    expect(closeSpy).toHaveBeenCalled();
    expect(es.readyState).toBe(FakeEventSource.CLOSED);

    act(() => {
      vi.advanceTimersByTime(60000); // no reconnect may fire after unmount
    });
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('closes the stream when enabled flips to false and reopens when re-enabled', () => {
    const { result, rerender } = renderHook((props) => useSseOrders(props), {
      initialProps: baseProps,
    });
    expect(FakeEventSource.instances).toHaveLength(1);

    rerender({ ...baseProps, enabled: false });
    expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED);
    expect(result.current.connected).toBe(false);

    rerender({ ...baseProps, enabled: true });
    expect(FakeEventSource.instances).toHaveLength(2); // fresh stream
  });
});
