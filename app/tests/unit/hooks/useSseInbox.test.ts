import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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

beforeEach(() => {
  FakeEventSource.instances = [];
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
});

afterEach(() => {
  delete globalThis.EventSource;
  vi.useRealTimers();
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
    expect(result.current.connected).toBe(false);
  });

  it('does not open a stream when the token is missing', () => {
    const { result } = renderHook(() => useSseInbox({ ...baseProps, token: undefined }));
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(result.current.connected).toBe(false);
  });

  it('does not open a stream when tenantId is missing', () => {
    const { result } = renderHook(() => useSseInbox({ ...baseProps, tenantId: undefined }));
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(result.current.connected).toBe(false);
  });

  it('opens the inbox stream when enabled with tenant and token', () => {
    const { result } = renderHook(() => useSseInbox(baseProps));
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe(
      'http://localhost:8787/api/stream/orders?tenantId=t1&token=tok',
    );
    expect(result.current.connected).toBe(false);
  });

  it('reports connected once the stream opens', () => {
    const { result } = renderHook(() => useSseInbox(baseProps));
    act(() => {
      FakeEventSource.instances[0].onopen?.();
    });
    expect(result.current.connected).toBe(true);
  });

  it('forwards parsed events to onEvent', () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() => useSseInbox({ ...baseProps, onEvent }));
    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: 'data: {"type":"new-lead","leadId":"l1","name":"Ada"}',
      });
    });
    expect(result.current.connected).toBe(false); // no onopen yet
    expect(onEvent).toHaveBeenCalledWith({ type: 'new-lead', leadId: 'l1', name: 'Ada' });
  });

  it('forwards both new-lead and new-booking events', () => {
    const onEvent = vi.fn();
    renderHook(() => useSseInbox({ ...baseProps, onEvent }));
    const es = FakeEventSource.instances[0];

    act(() => {
      es.onmessage?.({ data: 'data: {"type":"new-lead","leadId":"l1","name":"Ada"}' });
      es.onmessage?.({ data: 'data: {"type":"new-booking","orderId":9,"campId":2}' });
    });

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenNthCalledWith(1, { type: 'new-lead', leadId: 'l1', name: 'Ada' });
    expect(onEvent).toHaveBeenNthCalledWith(2, { type: 'new-booking', orderId: 9, campId: 2 });
  });

  it('uses the latest onEvent callback across renders without reopening', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook((props) => useSseInbox(props), {
      initialProps: { ...baseProps, onEvent: first },
    });

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

  it('reconnects on error with exponential backoff capped at 10s', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSseInbox(baseProps));
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
    const { unmount } = renderHook(() => useSseInbox(baseProps));
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
    const { result, rerender } = renderHook((props) => useSseInbox(props), {
      initialProps: baseProps,
    });
    expect(FakeEventSource.instances).toHaveLength(1);

    rerender({ ...baseProps, enabled: false });
    expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED);
    expect(result.current.connected).toBe(false);

    rerender({ ...baseProps, enabled: true });
    expect(FakeEventSource.instances).toHaveLength(2); // fresh stream
  });

  it('opens a new stream when tenantId changes', () => {
    const { rerender } = renderHook((props) => useSseInbox(props), {
      initialProps: baseProps,
    });
    expect(FakeEventSource.instances).toHaveLength(1);

    rerender({ ...baseProps, tenantId: 't2' });
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED);
    expect(FakeEventSource.instances[1].url).toContain('tenantId=t2');
  });

  it('opens a new stream when token changes', () => {
    const { rerender } = renderHook((props) => useSseInbox(props), {
      initialProps: baseProps,
    });
    expect(FakeEventSource.instances).toHaveLength(1);

    rerender({ ...baseProps, token: 'new-tok' });
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[1].url).toContain('token=new-tok');
  });

  it('resets connected to false when conditions become invalid mid-stream', () => {
    const { result, rerender } = renderHook((props) => useSseInbox(props), {
      initialProps: baseProps,
    });
    act(() => {
      FakeEventSource.instances[0].onopen?.();
    });
    expect(result.current.connected).toBe(true);

    rerender({ ...baseProps, token: undefined });
    expect(result.current.connected).toBe(false);
    expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED);
  });

  it('does not reconnect until the full backoff delay elapses', () => {
    vi.useFakeTimers();
    renderHook(() => useSseInbox(baseProps));

    act(() => { FakeEventSource.instances[0].onerror?.(); });
    act(() => { vi.advanceTimersByTime(2999); });
    expect(FakeEventSource.instances).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(1); });
    expect(FakeEventSource.instances).toHaveLength(2);
  });
});
