import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseSSEEvent,
  openOrdersStream,
  openInboxStream,
  mintStreamToken,
  StreamTokenMintError,
} from '@/lib/sse';

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

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  FakeEventSource.instances = [];
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  delete (globalThis as any).EventSource;
  delete (globalThis as any).fetch;
  vi.useRealTimers();
});

const API = 'http://localhost:8787/api/v1';

// ── mintStreamToken (Wave 3.4a, F-A16-02) ──────────────────────────────

describe('mintStreamToken', () => {
  it('POSTs the admin JWT in an Authorization header and returns the stream token', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ token: 'stream-tok', expiresIn: 60, type: 'stream' }),
    } as unknown as Response);

    const result = await mintStreamToken(API, 'admin-jwt');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8787/api/v1/stream/token',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer admin-jwt' },
      }),
    );
    expect(result).toEqual({ token: 'stream-tok', expiresIn: 60, type: 'stream' });
  });

  it('strips a trailing slash from apiBase before minting', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ token: 't', expiresIn: 60, type: 'stream' }),
    } as unknown as Response);

    await mintStreamToken('http://localhost:8787/api/', 'jwt');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8787/api/stream/token',
      expect.anything(),
    );
  });

  it('throws StreamTokenMintError with the server status on a 401', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Session expired or invalid signature' }),
    } as unknown as Response);

    const err = await mintStreamToken(API, 'jwt').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(StreamTokenMintError);
    expect((err as StreamTokenMintError).status).toBe(401);
    expect((err as StreamTokenMintError).message).toBe('Session expired or invalid signature');
  });

  it('throws StreamTokenMintError with the server status on a 403', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden: admin role required' }),
    } as unknown as Response);

    const err = await mintStreamToken(API, 'jwt').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(StreamTokenMintError);
    expect((err as StreamTokenMintError).status).toBe(403);
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);

    const err = await mintStreamToken(API, 'jwt').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(StreamTokenMintError);
    expect((err as StreamTokenMintError).status).toBe(429);
    expect((err as StreamTokenMintError).message).toBe('Stream token mint failed (429)');
  });

  it('classifies network failures as status 0 (ambiguous)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    const err = await mintStreamToken(API, 'jwt').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(StreamTokenMintError);
    expect((err as StreamTokenMintError).status).toBe(0);
  });

  it('throws status 500 when a 201 body has no token', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ expiresIn: 60 }),
    } as unknown as Response);

    const err = await mintStreamToken(API, 'jwt').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(StreamTokenMintError);
    expect((err as StreamTokenMintError).status).toBe(500);
    expect((err as StreamTokenMintError).message).toBe('Stream token mint returned no token');
  });
});

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
      'http://localhost:8787/api/v1/stream/orders?tenantId=my%20camp&token=tok%2F123',
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

  it('closes the source BEFORE surfacing onError (no native re-connect onto a burned token)', () => {
    const onError = vi.fn();
    openOrdersStream({ apiBase: API, tenantId: 't1', token: 'tok', onEvent: () => {}, onError });
    const es = FakeEventSource.instances[0];

    es.onerror?.();

    expect(es.readyState).toBe(FakeEventSource.CLOSED);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('appends lastEventId to the stream URL for replay', () => {
    openOrdersStream({
      apiBase: API,
      tenantId: 't1',
      token: 'tok',
      lastEventId: 'evt/last+1',
      onEvent: () => {},
    });
    expect(FakeEventSource.instances[0].url).toBe(
      'http://localhost:8787/api/v1/stream/orders?tenantId=t1&token=tok&lastEventId=evt%2Flast%2B1',
    );
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

  // ── replay marker + reset frame (Wave 3.4b, F-A16-03) ──────────────

  it('calls onId with the frame id before delivering the event', () => {
    const order: string[] = [];
    const onEvent = vi.fn(() => order.push('event'));
    const onId = vi.fn(() => order.push('id'));

    openOrdersStream({ apiBase: API, tenantId: 't1', token: 'tok', onEvent, onId });
    FakeEventSource.instances[0].onmessage?.({
      data: 'data: {"type":"new-booking","orderId":"o1"}',
      lastEventId: '7',
    });

    expect(onId).toHaveBeenCalledWith('7');
    expect(onEvent).toHaveBeenCalledTimes(1);
    // The marker must advance before the consumer's handler runs.
    expect(order).toEqual(['id', 'event']);
  });

  it('advances the marker even when the event is deduplicated', () => {
    const onEvent = vi.fn();
    const onId = vi.fn();

    openOrdersStream({ apiBase: API, tenantId: 't1', token: 'tok', onEvent, onId });
    const es = FakeEventSource.instances[0];
    es.onmessage?.({ data: 'data: {"type":"new-booking","orderId":"o1"}', lastEventId: '1' });
    es.onmessage?.({ data: 'data: {"type":"new-booking","orderId":"o1"}', lastEventId: '2' });

    expect(onEvent).toHaveBeenCalledTimes(1); // deduped
    expect(onId).toHaveBeenCalledTimes(2);
    expect(onId).toHaveBeenNthCalledWith(2, '2');
  });

  it('does not call onId for a frame that carries no id', () => {
    const onId = vi.fn();
    openOrdersStream({ apiBase: API, tenantId: 't1', token: 'tok', onEvent: () => {}, onId });
    FakeEventSource.instances[0].onmessage?.({ data: 'data: {"type":"connected"}' });
    expect(onId).not.toHaveBeenCalled();
  });

  it('calls onReset when the server emits a reset frame', () => {
    const onReset = vi.fn();
    openOrdersStream({ apiBase: API, tenantId: 't1', token: 'tok', onEvent: () => {}, onReset });
    FakeEventSource.instances[0].emit('reset');
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('stops delivering reset after close', () => {
    const onReset = vi.fn();
    const { close } = openOrdersStream({
      apiBase: API,
      tenantId: 't1',
      token: 'tok',
      onEvent: () => {},
      onReset,
    });
    const es = FakeEventSource.instances[0];
    close();
    es.emit('reset');
    expect(onReset).not.toHaveBeenCalled();
  });

  it('tolerates omitted onId/onReset callbacks', () => {
    expect(() => {
      openOrdersStream({ apiBase: API, tenantId: 't1', token: 'tok', onEvent: () => {} });
      FakeEventSource.instances[0].onmessage?.({
        data: 'data: {"type":"connected"}',
        lastEventId: '3',
      });
      FakeEventSource.instances[0].emit('reset');
    }).not.toThrow();
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

  it('closes the source BEFORE surfacing onError (no native re-connect onto a burned token)', () => {
    const onError = vi.fn();
    openInboxStream({ apiBase: API, tenantId: 't1', token: 'tok', onEvent: () => {}, onError });
    const es = FakeEventSource.instances[0];

    es.onerror?.();

    expect(es.readyState).toBe(FakeEventSource.CLOSED);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('appends lastEventId to the stream URL for replay', () => {
    openInboxStream({
      apiBase: API,
      tenantId: 't1',
      token: 'tok',
      lastEventId: 'evt_9',
      onEvent: () => {},
    });
    expect(FakeEventSource.instances[0].url).toBe(
      'http://localhost:8787/api/v1/stream/orders?tenantId=t1&token=tok&lastEventId=evt_9',
    );
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

  // ── replay marker + reset frame (Wave 3.4b, F-A16-03) ──────────────

  it('calls onId with the frame id and calls onReset on a reset frame', () => {
    const onId = vi.fn();
    const onReset = vi.fn();
    openInboxStream({
      apiBase: API,
      tenantId: 't1',
      token: 'tok',
      onEvent: () => {},
      onId,
      onReset,
    });
    const es = FakeEventSource.instances[0];
    es.emit('reset');
    es.onmessage?.({ data: 'data: {"type":"new-lead","leadId":"l1"}', lastEventId: '9' });

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onId).toHaveBeenCalledWith('9');
  });
});
