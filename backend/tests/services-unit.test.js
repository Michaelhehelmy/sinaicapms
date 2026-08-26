/**
 * Service Module tests — CRUD for definitions, items, bookings, reviews.
 *
 * Mounts src/api/services.js through helpers/routerHarness.js exactly as
 * index.js does, with a SQL-routing chain mock (same pattern as promotions).
 *
 * CRITICAL mock patterns:
 * - Pass RAW ARRAYS to .on() — the handler auto-wraps: { results: rawArray, meta }.
 *   Passing { results: [...] } causes double-wrapping → .first() returns undefined.
 * - Use [\s\S]* instead of .* for multiline SQL — JS regex `.` does NOT match \n.
 */
import { describe, it, expect, vi } from 'vitest';
import servicesRoutes from '../src/api/services';
import { mountRouter } from './helpers/routerHarness';

// ── SQL-routing mock DB ─────────────────────────────────────────────────────

function makeRoutingDb() {
  const handlers = [];
  const db = {
    prepare: vi.fn((sql) => {
      const stmt = {
        bind: vi.fn((...binds) => { stmt.boundBinds = binds; return stmt; }),
        boundBinds: [],
        all: vi.fn(async () => (await runHandler(sql, stmt.boundBinds)) ?? { results: [], meta: { changes: 0 } }),
        first: vi.fn(async () => ((await runHandler(sql, stmt.boundBinds))?.results ?? [])[0] ?? null),
        run: vi.fn(async () => (await runHandler(sql, stmt.boundBinds)) ?? { meta: { changes: 1 } }),
      };
      db.statements.push(stmt);
      return stmt;
    }),
    batch: vi.fn(async () => []),
    statements: [],
  };
  function runHandler(sql, binds) {
    for (const h of handlers) {
      if (h.match.test(sql)) return h.result(binds);
    }
    return undefined;
  }
  db.on = (match, result) => {
    handlers.push({ match, result: typeof result === 'function' ? result : () => ({ results: result ?? [], meta: { changes: 1 } }) });
    return db;
  };
  return db;
}

const env = (db) => ({ DB: db });
const TENANT_HEADERS = { 'Content-Type': 'application/json', 'x-tenant-id': 't1' };
const req = (path, init = {}) =>
  new Request(`http://localhost${path}`, { headers: TENANT_HEADERS, ...init });

// ── Definitions CRUD ────────────────────────────────────────────────────────

describe('Service Definitions', () => {
  it('GET /definitions lists all definitions', async () => {
    const db = makeRoutingDb().on(/FROM service_definitions/, [
      { id: 'def1', slug: 'massage', name: 'Massage Service', description: 'Relaxing massage', is_active: 1 }
    ]);
    const app = mountRouter(servicesRoutes, { tenantId: 't1' });
    const res = await app.request(req('/definitions'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].slug).toBe('massage');
  });

  it('POST /definitions creates a new definition', async () => {
    const db = makeRoutingDb()
      .on(/UNIQUE/, null)
      .on(/INSERT INTO service_definitions/, { meta: { changes: 1 } });
    const app = mountRouter(servicesRoutes, { tenantId: 't1' });
    const res = await app.request(req('/definitions', {
      method: 'POST',
      body: JSON.stringify({ slug: 'spa', name: 'Spa Treatment', description: 'Full spa day' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.slug).toBe('spa');
  });

  it('POST /definitions rejects invalid slug', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(servicesRoutes, { tenantId: 't1' });
    const res = await app.request(req('/definitions', {
      method: 'POST',
      body: JSON.stringify({ slug: 'INVALID SLUG!', name: 'Bad' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('PUT /definitions/:id updates a definition', async () => {
    const db = makeRoutingDb().on(/UPDATE service_definitions SET/, { meta: { changes: 1 } });
    const app = mountRouter(servicesRoutes, { tenantId: 't1' });
    const res = await app.request(req('/definitions/def1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated Name' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('DELETE /definitions/:id soft-deletes (is_active = 0)', async () => {
    const db = makeRoutingDb().on(/UPDATE service_definitions SET is_active = 0/, { meta: { changes: 1 } });
    const app = mountRouter(servicesRoutes, { tenantId: 't1' });
    const res = await app.request(req('/definitions/def1', { method: 'DELETE' }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 400 when no tenant ID', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(servicesRoutes, { tenantId: null });
    const res = await app.request(req('/definitions', { headers: { 'Content-Type': 'application/json' } }), {}, env(db));
    expect(res.status).toBe(400);
  });
});

// ── Items CRUD ──────────────────────────────────────────────────────────────

describe('Service Items', () => {
  it('GET /items lists items with definition info', async () => {
    // CRITICAL: use [\s\S]* for multiline SQL — JS `.` does NOT match \n
    const db = makeRoutingDb().on(/FROM service_items si[\s\S]*JOIN/, [
      { id: 'item1', name: 'Swedish Massage', definition_name: 'Massage Service', definition_slug: 'massage' }
    ]);
    const app = mountRouter(servicesRoutes, { tenantId: 't1' });
    const res = await app.request(req('/items'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body[0].name).toBe('Swedish Massage');
  });

  it('POST /items creates an item when definition exists', async () => {
    // CRITICAL: pass raw array [] not { results: [] } — mock auto-wraps
    const db = makeRoutingDb()
      .on(/SELECT id FROM service_definitions WHERE id/, [{ id: 'def1' }])
      .on(/INSERT INTO service_items/, { meta: { changes: 1 } });
    const app = mountRouter(servicesRoutes, { tenantId: 't1' });
    const res = await app.request(req('/items', {
      method: 'POST',
      body: JSON.stringify({ service_definition_id: 'def1', name: 'Deep Tissue', base_price: 80 }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it('POST /items returns 404 when definition not found', async () => {
    const db = makeRoutingDb().on(/SELECT id FROM service_definitions WHERE id/, []);
    const app = mountRouter(servicesRoutes, { tenantId: 't1' });
    const res = await app.request(req('/items', {
      method: 'POST',
      body: JSON.stringify({ service_definition_id: 'nonexistent', name: 'Bad' }),
    }), {}, env(db));
    expect(res.status).toBe(404);
  });

  it('DELETE /items/:id soft-deletes (status = archived)', async () => {
    const db = makeRoutingDb().on(/UPDATE service_items SET status = 'archived'/, { meta: { changes: 1 } });
    const app = mountRouter(servicesRoutes, { tenantId: 't1' });
    const res = await app.request(req('/items/item1', { method: 'DELETE' }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ── Bookings CRUD ───────────────────────────────────────────────────────────

describe('Service Bookings', () => {
  it('GET /bookings lists bookings', async () => {
    // CRITICAL: multiline SQL with JOINs — use [\s\S]* and raw array
    const db = makeRoutingDb().on(/FROM service_bookings sb[\s\S]*JOIN/, [
      { id: 'bk1', service_item_id: 'item1', item_name: 'Deep Tissue', status: 'pending' }
    ]);
    const app = mountRouter(servicesRoutes, { tenantId: 't1' });
    const res = await app.request(req('/bookings'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    // toCamel converts item_name → itemName on the wire
    expect(body[0].itemName).toBe('Deep Tissue');
  });

  it('POST /bookings creates a booking when item is active', async () => {
    // CRITICAL: pass raw arrays, not { results: [...] }
    const db = makeRoutingDb()
      .on(/SELECT id, status FROM service_items WHERE id/, [{ id: 'item1', status: 'active' }])
      .on(/INSERT INTO service_bookings/, { meta: { changes: 1 } });
    const app = mountRouter(servicesRoutes, { tenantId: 't1' });
    const res = await app.request(req('/bookings', {
      method: 'POST',
      body: JSON.stringify({ service_item_id: 'item1', customer_name: 'John Doe', scheduled_date: '2026-09-01' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.status).toBe('pending');
  });

  it('POST /bookings returns 404 when item not found', async () => {
    const db = makeRoutingDb().on(/SELECT id, status FROM service_items WHERE id/, []);
    const app = mountRouter(servicesRoutes, { tenantId: 't1' });
    const res = await app.request(req('/bookings', {
      method: 'POST',
      body: JSON.stringify({ service_item_id: 'nonexistent' }),
    }), {}, env(db));
    expect(res.status).toBe(404);
  });

  it('POST /bookings returns 400 when item is inactive', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id, status FROM service_items WHERE id/, [{ id: 'item1', status: 'inactive' }]);
    const app = mountRouter(servicesRoutes, { tenantId: 't1' });
    const res = await app.request(req('/bookings', {
      method: 'POST',
      body: JSON.stringify({ service_item_id: 'item1' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('POST /bookings returns 409 on double-booking', async () => {
    // The item check returns active, but the atomic INSERT returns 0 changes.
    // CRITICAL: use a function to return meta.changes = 0 — passing an object
    // gets double-wrapped by the mock auto-wrapper, overriding changes to 1.
    const db = makeRoutingDb()
      .on(/SELECT id, status FROM service_items WHERE id/, [{ id: 'item1', status: 'active' }])
      .on(/INSERT INTO service_bookings[\s\S]*WHERE NOT EXISTS/, () => ({ meta: { changes: 0 } }));
    const app = mountRouter(servicesRoutes, { tenantId: 't1' });
    const res = await app.request(req('/bookings', {
      method: 'POST',
      body: JSON.stringify({ service_item_id: 'item1', scheduled_date: '2026-09-01' }),
    }), {}, env(db));
    expect(res.status).toBe(409);
  });

  it('PATCH /bookings/:id/status transitions pending → confirmed', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id, status FROM service_bookings WHERE id/, [{ id: 'bk1', status: 'pending' }])
      .on(/UPDATE service_bookings SET status/, { meta: { changes: 1 } });
    const app = mountRouter(servicesRoutes, { tenantId: 't1' });
    const res = await app.request(req('/bookings/bk1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'confirmed' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe('confirmed');
  });

  it('PATCH /bookings/:id/status rejects invalid transition (pending → completed)', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id, status FROM service_bookings WHERE id/, [{ id: 'bk1', status: 'pending' }]);
    const app = mountRouter(servicesRoutes, { tenantId: 't1' });
    const res = await app.request(req('/bookings/bk1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('PATCH /bookings/:id/status returns 404 for non-existent booking', async () => {
    const db = makeRoutingDb().on(/SELECT id, status FROM service_bookings WHERE id/, []);
    const app = mountRouter(servicesRoutes, { tenantId: 't1' });
    const res = await app.request(req('/bookings/nonexistent/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'confirmed' }),
    }), {}, env(db));
    expect(res.status).toBe(404);
  });
});

// ── Reviews ─────────────────────────────────────────────────────────────────

describe('Service Reviews', () => {
  it('POST /reviews creates a review with valid rating', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM service_items WHERE id/, [{ id: 'item1' }])
      .on(/INSERT INTO service_reviews/, { meta: { changes: 1 } });
    const app = mountRouter(servicesRoutes, { tenantId: 't1' });
    const res = await app.request(req('/reviews', {
      method: 'POST',
      body: JSON.stringify({ service_item_id: 'item1', rating: 5, comment: 'Excellent service!' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it('POST /reviews rejects invalid rating (0 or 6)', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(servicesRoutes, { tenantId: 't1' });
    const res0 = await app.request(req('/reviews', {
      method: 'POST',
      body: JSON.stringify({ service_item_id: 'item1', rating: 0 }),
    }), {}, env(db));
    expect(res0.status).toBe(400);
    const res6 = await app.request(req('/reviews', {
      method: 'POST',
      body: JSON.stringify({ service_item_id: 'item1', rating: 6 }),
    }), {}, env(db));
    expect(res6.status).toBe(400);
  });

  it('GET /reviews lists all reviews for tenant', async () => {
    // CRITICAL: multiline SQL — use [\s\S]* and raw array
    const db = makeRoutingDb().on(/FROM service_reviews sr[\s\S]*JOIN/, [
      { id: 'r1', rating: 5, comment: 'Great!', item_name: 'Deep Tissue' }
    ]);
    const app = mountRouter(servicesRoutes, { tenantId: 't1' });
    const res = await app.request(req('/reviews'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body[0].rating).toBe(5);
  });
});

// ── Status Transition Validation ────────────────────────────────────────────

describe('Booking Status Transitions', () => {
  it('allows: pending → confirmed → en_route → completed', async () => {
    const transitions = [
      ['pending', 'confirmed'],
      ['confirmed', 'en_route'],
      ['en_route', 'completed'],
    ];
    for (const [from, to] of transitions) {
      const db = makeRoutingDb()
        .on(/SELECT id, status FROM service_bookings WHERE id/, [{ id: 'bk1', status: from }])
        .on(/UPDATE service_bookings SET status/, { meta: { changes: 1 } });
      const app = mountRouter(servicesRoutes, { tenantId: 't1' });
      const res = await app.request(req('/bookings/bk1/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: to }),
      }), {}, env(db));
      expect(res.status).toBe(200);
    }
  });

  it('allows: pending → canceled, confirmed → canceled, en_route → canceled', async () => {
    const cancelable = ['pending', 'confirmed', 'en_route'];
    for (const from of cancelable) {
      const db = makeRoutingDb()
        .on(/SELECT id, status FROM service_bookings WHERE id/, [{ id: 'bk1', status: from }])
        .on(/UPDATE service_bookings SET status/, { meta: { changes: 1 } });
      const app = mountRouter(servicesRoutes, { tenantId: 't1' });
      const res = await app.request(req('/bookings/bk1/status', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'canceled' }),
      }), {}, env(db));
      expect(res.status).toBe(200);
    }
  });

  it('rejects: completed → confirmed (terminal state)', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id, status FROM service_bookings WHERE id/, [{ id: 'bk1', status: 'completed' }]);
    const app = mountRouter(servicesRoutes, { tenantId: 't1' });
    const res = await app.request(req('/bookings/bk1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'confirmed' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('rejects: canceled → confirmed (terminal state)', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id, status FROM service_bookings WHERE id/, [{ id: 'bk1', status: 'canceled' }]);
    const app = mountRouter(servicesRoutes, { tenantId: 't1' });
    const res = await app.request(req('/bookings/bk1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'confirmed' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });
});
