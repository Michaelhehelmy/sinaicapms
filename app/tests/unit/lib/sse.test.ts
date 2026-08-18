import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseSSEEvent, openOrdersStream, openInboxStream } from '@/lib/sse';

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

const API = 'http://localhost:8787/api';

// ── parseSSEEvent ──────────────────────────────────────────────────────

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

  it('parses nested JSON objects', () => {
    expect(parseSSEEvent('data: {"type":"new-booking","meta":{"nested":true}}')).toEqual({
      type: 'new-booking',
      meta: { nested: true },
    });
  });
});

// ── openOrdersStream ───────────────────────────────────────────────────

describe('openOrdersStream', () => {
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

  it('strips trailing slashes from apiBase', () => {
    openOrdersStream({
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

  it('calls onOpen when EventSource opens', () => {
    const onOpen = vi.fn();
    openOrdersStream({ apiBase: API, tenantId: 't1', token: 'tok', onEvent: () => {}, onOpen });
    FakeEventSource.instances[0].onopen?.();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('calls onError when EventSource errors', () => {
    const onError = vi.fn();
    openOrdersStream({ apiBase: API, tenantId: 't1', token: 'tok', onEvent: () => {}, onError });
    FakeEventSource.instances[0].onerror?.();
    expect(onError).toHaveBeenCalledTimes(1);
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

  it('does not fire onEvent after close', () => {
    const onEvent = vi.fn();
    const { close } = openOrdersStream({
      apiBase: API,
      tenantId: 't1',
      token: 'tok',
      onEvent,
    });
    close();
    FakeEventSource.instances[0].onmessage?.({ data: 'data: {"type":"connected"}' });
    expect(onEvent).not.toHaveBeenCalled();
  });
});

// ── openInboxStream ────────────────────────────────────────────────────

describe('openInboxStream', () => {
  it('connects to the same per-tenant /stream/orders URL as orders', () => {
    openInboxStream({
      apiBase: API,
      tenantId: 'my camp',
      token: 'tok/1',
      onEvent: () => {},
    });
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe(
      'http://localhost:8787/api/stream/orders?tenantId=my%20camp&token=tok%2F1',
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
    expect(FakeEventSource.instances[0].url).toContain('http://localhost:8787/api/stream/orders');
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

  it('calls onOpen when EventSource opens', () => {
    const onOpen = vi.fn();
    openInboxStream({ apiBase: API, tenantId: 't1', token: 'tok', onEvent: () => {}, onOpen });
    FakeEventSource.instances[0].onopen?.();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('calls onError when EventSource errors', () => {
    const onError = vi.fn();
    openInboxStream({ apiBase: API, tenantId: 't1', token: 'tok', onEvent: () => {}, onError });
    FakeEventSource.instances[0].onerror?.();
    expect(onError).toHaveBeenCalledTimes(1);
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

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED);
    expect(FakeEventSource.instances[0].onmessage).toBeNull();
    expect(onEvent).not.toHaveBeenCalled();
    close(); // safe no-op
  });

  it('does not fire onEvent after close', () => {
    const onEvent = vi.fn();
    const { close } = openInboxStream({
      apiBase: API,
      tenantId: 't1',
      token: 'tok',
      onEvent,
    });
    close();
    FakeEventSource.instances[0].onmessage?.({ data: 'data: {"type":"new-lead","leadId":"l1"}' });
    expect(onEvent).not.toHaveBeenCalled();
  });
});
