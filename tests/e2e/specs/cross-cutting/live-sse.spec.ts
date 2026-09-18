import { test, expect, type Page } from '../../fixtures/coverage-fixture';
import { apiRequest, tenantAdminLogin } from '../../utils/api-helpers';
import { API_BASE, TEST_TENANT, TEST_CAMPS, TEST_PRODUCTS } from '../../fixtures/test-data';

// Live SSE broadcast (frozen backend — Broadcaster Durable Object):
//
//   POST /api/stream/token                → 60s single-use `stream` token
//     (admin JWT in Authorization header, not in the URL)
//   GET /api/stream/orders?tenantId=<id>[&token=<stream-token>]
//     → first frame { type: 'connected' }, then broadcast frames:
//       { type: 'new-booking', orderId, campId, checkIn, checkOut }
//       { type: 'new-lead', leadId, name, subject }
//     → 401 without token | 401 with a 24h admin JWT (type check) |
//       400 without tenantId
//
// Wave 3.4a (F-A16-02): the stream NEVER carries the 24h admin JWT in the
// URL. The collector mints a fresh 60-second single-use stream token from
// POST /api/stream/token first (admin JWT rides an Authorization header),
// then opens the EventSource with that short-lived token. CORS (hono/cors
// global) allows the localhost:4320 origin, so both fetch calls run from a
// real app page.
//
// Local-dev flakiness guard (verified empirically): under `wrangler dev
// --local` a DO-backed SSE stream can be silently abandoned ~2.5–3s after
// connect — the socket stays open (no onerror, readyState stays 1) but the
// channel is gone and broadcasts land on a fresh instance with zero
// subscribers. The broadcast ALSO misses when the mutating call beats the
// DO's first `openStream` (cold-start race). Both races are avoided by:
//   1. waiting for the `connected` frame on the page BEFORE mutating
//      (`__sseConnected<N>` barrier), so the channel is provably live;
//   2. issuing the mutating call IMMEDIATELY after connected (≤~1.5s);
//   3. on a miss, reconnecting with a fresh EventSource + fresh stream token
//      and retrying the mutation (bounded ×2) instead of letting the stale
//      connection time out the whole test.

const TIMESTAMP = Date.now();
const TENANT_ID = String(TEST_TENANT.id);
const ROOM_NAME = `SSE Room ${TIMESTAMP}`;
const MAX_ATTEMPTS = 2;

function orderDates(attempt: number) {
  // Offset check-in per attempt so a retried order never collides with the
  // previous one (same room + same dates → 400 availability conflict).
  return {
    check_in_date: `2027-09-0${attempt + 1}`,
    check_out_date: `2027-09-0${attempt + 2}`,
  };
}

interface CollectorResult {
  connected: boolean;
  frames: Array<Record<string, unknown>>;
  timedOut: boolean;
}

function makeCollector(attempt: number) {
  return async ({ apiBase, tenantId, authToken, attempt: a }: {
    apiBase: string;
    tenantId: string;
    authToken: string;
    attempt: number;
  }) => {
    return await new Promise<CollectorResult>(async (resolve) => {
      // Wave 3.4a (F-A16-02): mint a short-lived single-use stream token
      // first — the admin JWT stays in an Authorization header and must NEVER
      // ride the SSE query string.
      const mintRes = await fetch(`${apiBase}/api/stream/token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!mintRes.ok) {
        throw new Error(
          `SSE attempt ${a}: stream token mint failed with status ${mintRes.status}`,
        );
      }
      const minted = (await mintRes.json()) as { token: string };
      if (!minted.token) {
        throw new Error(`SSE attempt ${a}: stream token mint returned no token`);
      }

      const es = new EventSource(`${apiBase}/api/stream/orders?tenantId=${tenantId}&token=${minted.token}`);
      const frames: Array<Record<string, unknown>> = [];
      let connected = false;
      const flag = (n: string, v: boolean) => {
        (window as unknown as Record<string, boolean>)[n] = v;
      };
      flag(`__sseConnected${a}`, false);
      flag(`__sseHasEvent${a}`, false);

      const timer = setTimeout(() => {
        es.close();
        resolve({ connected, frames, timedOut: true });
      }, 10_000);
      const esRef = es;
      const timerRef = timer;

      es.onmessage = (e) => {
        let frame: Record<string, unknown>;
        try {
          frame = JSON.parse(e.data) as Record<string, unknown>;
        } catch {
          frame = { raw: e.data };
        }
        frames.push(frame);
        if (frame.type === 'connected' && !connected) {
          connected = true;
          flag(`__sseConnected${a}`, true);
        }
        if (frame.type === 'new-booking' || frame.type === 'new-lead') {
          flag(`__sseHasEvent${a}`, true);
          clearTimeout(timerRef);
          esRef.close();
          resolve({ connected, frames, timedOut: false });
        }
      };
      es.onerror = () => {
        // Transient heartbeat/network errors are expected — keep waiting.
      };
    });
  };
}

/** One broadcast attempt: connect → barrier → mutate → await event. */
async function runBroadcastAttempt(
  page: Page,
  attempt: number,
  token: string,
  mutate: () => Promise<number>,
): Promise<CollectorResult> {
  const framesPromise = page.evaluate(makeCollector(attempt), {
    apiBase: API_BASE,
    tenantId: TENANT_ID,
    authToken: token,
    attempt,
  });

  // 1. Barrier — wait for the channel to be provably live before mutating.
  await page
    .waitForFunction(
      (flag) => (window as unknown as Record<string, boolean>)[flag] === true,
      `__sseConnected${attempt}`,
      { timeout: 8_000 },
    )
    .catch(() => {
      throw new Error(`SSE attempt ${attempt}: stream never connected`);
    });

  // 2. Mutate immediately after connected (inside the live window).
  const mutationStatus = await mutate();
  if (mutationStatus !== 200) {
    throw new Error(`SSE attempt ${attempt}: mutation failed with status ${mutationStatus}`);
  }

  // 3. Await the collector (resolves on the event or a 10s cap).
  return framesPromise;
}

test.describe('Live SSE order stream', () => {
  let token: string;
  let roomId: string;

  function tenantHeaders() {
    return { Authorization: `Bearer ${token}`, 'x-tenant-id': TENANT_ID };
  }

  test.beforeAll(async () => {
    token = await tenantAdminLogin();

    const roomRes = await apiRequest(
      'POST',
      '/api/rooms',
      {
        camp_id: TEST_CAMPS[0].id,
        product_id: TEST_PRODUCTS[0].id,
        name: ROOM_NAME,
        floor: 1,
      },
      tenantHeaders(),
    );
    expect(roomRes.status).toBe(200);
    roomId = (await roomRes.json()).id;
    expect(roomId).toBeTruthy();
  });

  test('stream rejects a missing token with 401', async () => {
    const res = await apiRequest(
      'GET',
      `/api/stream/orders?tenantId=${TENANT_ID}`,
      undefined,
      { 'x-tenant-id': TENANT_ID },
    );
    expect(res.status).toBe(401);
  });

  test('stream rejects a missing tenantId with 400', async () => {
    // A 24h admin JWT would now 401 here (token-type check) — mint the
    // short-lived stream token first so we isolate the tenantId check.
    const mint = await apiRequest('POST', '/api/stream/token', undefined, tenantHeaders());
    expect(mint.status).toBe(201);
    const streamToken = ((await mint.json()) as { token: string }).token;
    expect(streamToken).toBeTruthy();

    const res = await apiRequest(
      'GET',
      '/api/stream/orders',
      undefined,
      { Authorization: `Bearer ${streamToken}`, 'x-tenant-id': TENANT_ID },
    );
    expect(res.status).toBe(400);
  });

  test('new-booking broadcast reaches a live stream', async ({ page }) => {
    await page.goto(`/admin?tenant=${TEST_TENANT.id}`, { waitUntil: 'domcontentloaded' });

    const createdOrderIds: string[] = [];
    let result: CollectorResult | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      result = await runBroadcastAttempt(page, attempt, token, async () => {
        const orderRes = await apiRequest(
          'POST',
          '/api/orders',
          {
            camp_id: TEST_CAMPS[0].id,
            room_id: roomId,
            guest_name: `SSE Guest ${TIMESTAMP}${attempt}`,
            guest_email: `sse-${TIMESTAMP}-${attempt}@test.com`,
            guest_phone: '+20100100100',
            ...orderDates(attempt),
            total_amount: 200,
          },
          tenantHeaders(),
        );
        const order = (await orderRes.json()) as { id?: string };
        if (orderRes.ok && order.id) createdOrderIds.push(order.id);
        return orderRes.status;
      });

      if (!result.timedOut) break;
    }

    expect(result, 'all SSE attempts failed').not.toBeNull();
    expect(result!.timedOut, 'broadcast missed the live stream (reconnect retries exhausted)').toBe(false);

    const booking = result!.frames.find((f) => f.type === 'new-booking');
    expect(booking, 'no new-booking frame in collector frames').toBeTruthy();
    expect(booking!.orderId).toBeTruthy();
    expect(createdOrderIds).toContain(booking!.orderId);

    // Cleanup: order created only to prove the broadcast — delete it.
    if (booking!.orderId) {
      await apiRequest('DELETE', `/api/orders/${booking!.orderId}`, undefined, tenantHeaders()).catch(() => {});
    }
  });

  test('new-lead broadcast reaches a live stream', async ({ page }) => {
    await page.goto(`/admin?tenant=${TEST_TENANT.id}`, { waitUntil: 'domcontentloaded' });

    const createdLeadIds: string[] = [];
    const createdLeadNames: string[] = [];
    let result: CollectorResult | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      result = await runBroadcastAttempt(page, attempt, token, async () => {
        const leadName = `SSE Lead ${TIMESTAMP}${attempt}`;
        const leadRes = await apiRequest(
          'POST',
          '/api/leads',
          {
            name: leadName,
            email: `sse-lead-${TIMESTAMP}-${attempt}@test.com`,
            subject: 'SSE broadcast test',
            message: 'Lead created to prove the new-lead broadcast.',
          },
          { 'x-tenant-id': TENANT_ID },
        );
        const lead = (await leadRes.json()) as { id?: string };
        if (leadRes.ok && lead.id) {
          createdLeadIds.push(lead.id);
          createdLeadNames.push(leadName);
        }
        return leadRes.status;
      });

      if (!result.timedOut) break;
    }

    expect(result, 'all SSE attempts failed').not.toBeNull();
    expect(result!.timedOut, 'broadcast missed the live stream (reconnect retries exhausted)').toBe(false);

    const leadFrame = result!.frames.find((f) => f.type === 'new-lead');
    expect(leadFrame, 'no new-lead frame in collector frames').toBeTruthy();
    expect(leadFrame!.leadId).toBeTruthy();
    expect(createdLeadIds).toContain(leadFrame!.leadId);
    expect(createdLeadNames).toContain(leadFrame!.name);
  });
});