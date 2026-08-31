import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import servicesRouter from '../src/api/services.js';

function mount() {
  const scopeMiddleware = async (c, next) => {
    c.set('tenantId', 'tee1');
    await next();
  };
  const app = new Hono();
  app.use('/api/services', scopeMiddleware);
  app.use('/api/services/*', scopeMiddleware);
  app.route('/api/services', servicesRouter);
  return app;
}

function req(app, env, method, url, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  return app.request(`http://localhost${url}`, opts, env);
}

/**
 * Mock DB. `querySpecs` maps a distinctive SQL fragment → a descriptor:
 *   { first: <row|undefined>, all: <array>, run: <{meta}> }
 * Default: first → undefined, all → [], run → success.
 */
function mockDb(querySpecs = {}) {
  const db = {
    prepare: vi.fn((sql) => {
      let spec = null;
      for (const frag of Object.keys(querySpecs)) {
        if (sql.includes(frag)) { spec = querySpecs[frag]; break; }
      }
      const chain = {
        sql,
        bind: vi.fn((...args) => { chain.args = args; return chain; }),
        first: vi.fn().mockResolvedValue(spec?.first ?? undefined),
        all: vi.fn().mockResolvedValue({ results: spec?.all ?? [] }),
        run: vi.fn().mockResolvedValue(spec?.run ?? { success: true, meta: { changes: 1 } }),
      };
      return chain;
    }),
  };
  return db;
}

const superAdmin = { id: 'adm1', role: 'super_admin' };

describe('services', () => {
  let app;

  beforeEach(() => {
    app = mount();
  });

  // ─── Definitions ───────────────────────────────────────────
  describe('/definitions', () => {
    it('GET lists definitions (camelCase)', async () => {
      const env = { DB: mockDb({ 'service_definitions WHERE tenant_id': { all: [{ id: 'd1', name: 'Trek', is_active: 1, description: 'x', fields_schema: '[]' }] } }) };
      const res = await req(app, env, 'GET', '/api/services/definitions');
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body[0].name).toBe('Trek');
    });

    it('GET returns 400 without tenant id', async () => {
      const appNo = new Hono();
      appNo.route('/api/services', servicesRouter);
      const res = await req(appNo, { DB: mockDb() }, 'GET', '/api/services/definitions');
      expect(res.status).toBe(400);
    });

    it('POST creates a definition (slug provided)', async () => {
      const env = { DB: mockDb() };
      const res = await req(app, env, 'POST', '/api/services/definitions', { slug: 'trek', name: 'Trek' });
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.slug).toBe('trek');
    });

    it('POST returns 400 when slug omitted (slug is required by schema)', async () => {
      const env = { DB: mockDb() };
      const res = await req(app, env, 'POST', '/api/services/definitions', { name: 'Desert Safari' });
      expect(res.status).toBe(400);
    });

    it('POST returns 400 for missing name', async () => {
      const env = { DB: mockDb() };
      const res = await req(app, env, 'POST', '/api/services/definitions', { slug: 'trek' });
      expect(res.status).toBe(400);
    });

    it('POST returns 409 on unique slug violation', async () => {
      const env = {
        DB: {
          prepare: vi.fn(() => ({
            bind: vi.fn().mockReturnThis(),
            run: vi.fn(() => { throw new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: service_definitions.slug'); }),
          })),
        },
      };
      const res = await req(app, env, 'POST', '/api/services/definitions', { slug: 'trek', name: 'Trek' });
      expect(res.status).toBe(409);
    });

    it('PUT updates a definition with object serialization', async () => {
      const env = { DB: mockDb() };
      const res = await req(app, env, 'PUT', '/api/services/definitions/d1', { name: 'New', fields_schema: [{ k: 'v' }] });
      expect(res.status).toBe(200);
      const res2 = await res.json();
      expect(res2.success).toBe(true);
    });

    it('PUT returns 400 with no fields to update', async () => {
      const env = { DB: mockDb() };
      const res = await req(app, env, 'PUT', '/api/services/definitions/d1', {});
      expect(res.status).toBe(400);
    });

    it('PUT returns 400 for invalid field', async () => {
      const env = { DB: mockDb() };
      const res = await req(app, env, 'PUT', '/api/services/definitions/d1', { name: 123 });
      expect(res.status).toBe(400);
    });

    it('DELETE soft-deletes a definition', async () => {
      const env = { DB: mockDb() };
      const res = await req(app, env, 'DELETE', '/api/services/definitions/d1');
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  // ─── Items ─────────────────────────────────────────────────
  describe('/items', () => {
    it('GET lists items with joined names', async () => {
      const env = { DB: mockDb({ 'JOIN service_definitions': { all: [{ id: 'i1', name: 'Tent', definition_name: 'Gear' }] } }) };
      const res = await req(app, env, 'GET', '/api/services/items');
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body[0].definitionName).toBe('Gear');
    });

    it('POST creates an item after verifying definition', async () => {
      const env = { DB: mockDb({ 'FROM service_definitions WHERE id': { first: { id: 'd1' } } }) };
      const res = await req(app, env, 'POST', '/api/services/items', { service_definition_id: 'd1', name: 'Tent' });
      expect(res.status).toBe(201);
    });

    it('POST returns 404 when definition missing', async () => {
      const env = { DB: mockDb({ 'FROM service_definitions WHERE id': { first: undefined } }) };
      const res = await req(app, env, 'POST', '/api/services/items', { service_definition_id: 'd9', name: 'Tent' });
      expect(res.status).toBe(404);
    });

    it('POST returns 400 for invalid body', async () => {
      const env = { DB: mockDb() };
      const res = await req(app, env, 'POST', '/api/services/items', { name: 'Tent' });
      expect(res.status).toBe(400);
    });

    it('PUT updates an item with meta_data JSON serialization', async () => {
      const env = { DB: mockDb() };
      const res = await req(app, env, 'PUT', '/api/services/items/i1', { name: 'New', meta_data: { a: 1 } });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('PUT returns 400 for no fields', async () => {
      const env = { DB: mockDb() };
      const res = await req(app, env, 'PUT', '/api/services/items/i1', {});
      expect(res.status).toBe(400);
    });

    it('DELETE archives an item', async () => {
      const env = { DB: mockDb() };
      const res = await req(app, env, 'DELETE', '/api/services/items/i1');
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  // ─── Bookings ──────────────────────────────────────────────
  describe('/bookings', () => {
    it('GET lists bookings with optional status filter', async () => {
      const env = { DB: mockDb({ 'FROM service_bookings sb': { all: [{ id: 'b1', status: 'pending', item_name: 'Tent' }] } }) };
      const res = await req(app, env, 'GET', '/api/services/bookings?status=pending');
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body[0].itemName).toBe('Tent');
    });

    it('POST creates a booking without scheduled_date', async () => {
      const env = { DB: mockDb({ 'FROM service_items WHERE id': { first: { id: 'i1', status: 'active' } } }) };
      const res = await req(app, env, 'POST', '/api/services/bookings', { service_item_id: 'i1', customer_name: 'A' });
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.status).toBe('pending');
    });

    it('POST creates a booking with scheduled_date (no double-book)', async () => {
      const env = { DB: mockDb({ 'FROM service_items WHERE id': { first: { id: 'i1', status: 'active' } }, 'INSERT INTO service_bookings': { run: { success: true, meta: { changes: 1 } } } }) };
      const res = await req(app, env, 'POST', '/api/services/bookings', { service_item_id: 'i1', scheduled_date: '2026-09-01' });
      expect(res.status).toBe(201);
    });

    it('POST returns 409 when slot already booked', async () => {
      const env = { DB: mockDb({ 'FROM service_items WHERE id': { first: { id: 'i1', status: 'active' } }, 'INSERT INTO service_bookings': { run: { success: true, meta: { changes: 0 } } } }) };
      const res = await req(app, env, 'POST', '/api/services/bookings', { service_item_id: 'i1', scheduled_date: '2026-09-01' });
      expect(res.status).toBe(409);
    });

    it('POST returns 404 when item missing', async () => {
      const env = { DB: mockDb({ 'FROM service_items WHERE id': { first: undefined } }) };
      const res = await req(app, env, 'POST', '/api/services/bookings', { service_item_id: 'i9' });
      expect(res.status).toBe(404);
    });

    it('POST returns 400 when item inactive', async () => {
      const env = { DB: mockDb({ 'FROM service_items WHERE id': { first: { id: 'i1', status: 'archived' } } }) };
      const res = await req(app, env, 'POST', '/api/services/bookings', { service_item_id: 'i1' });
      expect(res.status).toBe(400);
    });

    it('PATCH status transitions pending→confirmed', async () => {
      const env = { DB: mockDb({ 'FROM service_bookings WHERE id': { first: { id: 'b1', status: 'pending' } } }) };
      const res = await req(app, env, 'PATCH', '/api/services/bookings/b1/status', { status: 'confirmed' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.status).toBe('confirmed');
    });

    it('PATCH status rejects invalid transition', async () => {
      const env = { DB: mockDb({ 'FROM service_bookings WHERE id': { first: { id: 'b1', status: 'completed' } } }) };
      const res = await req(app, env, 'PATCH', '/api/services/bookings/b1/status', { status: 'confirmed' });
      expect(res.status).toBe(400);
    });

    it('PATCH status returns 404 for missing booking', async () => {
      const env = { DB: mockDb({ 'FROM service_bookings WHERE id': { first: undefined } }) };
      const res = await req(app, env, 'PATCH', '/api/services/bookings/b1/status', { status: 'confirmed' });
      expect(res.status).toBe(404);
    });

    it('PATCH status returns 400 for bad body', async () => {
      const env = { DB: mockDb() };
      const res = await req(app, env, 'PATCH', '/api/services/bookings/b1/status', { status: 'bogus' });
      expect(res.status).toBe(400);
    });

    it('PATCH assign assigns a worker', async () => {
      const env = { DB: mockDb({ 'FROM service_bookings WHERE id': { first: { id: 'b1' } } }) };
      const res = await req(app, env, 'PATCH', '/api/services/bookings/b1/assign', { assigned_worker_id: 'w1' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.assignedWorkerId).toBe('w1');
    });

    it('PATCH assign returns 400 without worker id', async () => {
      const env = { DB: mockDb() };
      const res = await req(app, env, 'PATCH', '/api/services/bookings/b1/assign', {});
      expect(res.status).toBe(400);
    });

    it('PATCH assign returns 404 for missing booking', async () => {
      const env = { DB: mockDb({ 'FROM service_bookings WHERE id': { first: undefined } }) };
      const res = await req(app, env, 'PATCH', '/api/services/bookings/b1/assign', { assigned_worker_id: 'w1' });
      expect(res.status).toBe(404);
    });
  });

  // ─── Availability ──────────────────────────────────────────
  describe('availability', () => {
    it('GET item availability', async () => {
      const env = { DB: mockDb({ 'FROM service_items WHERE id': { first: { id: 'i1' } }, 'FROM service_availability': { all: [{ id: 's1', available_date: '2026-09-01' }] } }) };
      const res = await req(app, env, 'GET', '/api/services/items/i1/availability');
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body[0].availableDate).toBe('2026-09-01');
    });

    it('GET item availability returns 404 for missing item', async () => {
      const env = { DB: mockDb({ 'FROM service_items WHERE id': { first: undefined } }) };
      const res = await req(app, env, 'GET', '/api/services/items/i9/availability');
      expect(res.status).toBe(404);
    });

    it('POST creates availability slot', async () => {
      const env = { DB: mockDb({ 'FROM service_items WHERE id': { first: { id: 'i1' } } }) };
      const res = await req(app, env, 'POST', '/api/services/items/i1/availability', { available_date: '2026-09-01' });
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
    });

    it('POST returns 400 missing available_date', async () => {
      const env = { DB: mockDb({ 'FROM service_items WHERE id': { first: { id: 'i1' } } }) };
      const res = await req(app, env, 'POST', '/api/services/items/i1/availability', {});
      expect(res.status).toBe(400);
    });

    it('DELETE availability slot', async () => {
      const env = { DB: mockDb({ 'FROM service_availability WHERE id': { first: { id: 's1' } } }) };
      const res = await req(app, env, 'DELETE', '/api/services/availability/s1');
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('DELETE returns 404 for missing slot', async () => {
      const env = { DB: mockDb({ 'FROM service_availability WHERE id': { first: undefined } }) };
      const res = await req(app, env, 'DELETE', '/api/services/availability/s1');
      expect(res.status).toBe(404);
    });
  });

  // ─── Reviews ───────────────────────────────────────────────
  describe('reviews', () => {
    it('GET booking reviews', async () => {
      const env = { DB: mockDb({ 'FROM service_bookings WHERE id': { first: { service_item_id: 'i1' } }, 'FROM service_reviews WHERE service_item_id': { all: [{ id: 'r1', rating: 5 }] } }) };
      const res = await req(app, env, 'GET', '/api/services/bookings/b1/reviews');
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body[0].rating).toBe(5);
    });

    it('GET booking reviews returns 404 for missing booking', async () => {
      const env = { DB: mockDb({ 'FROM service_bookings WHERE id': { first: undefined } }) };
      const res = await req(app, env, 'GET', '/api/services/bookings/b1/reviews');
      expect(res.status).toBe(404);
    });

    it('GET reviews lists all tenant reviews', async () => {
      const env = { DB: mockDb({ 'JOIN service_items si ON sr': { all: [{ id: 'r1' }] } }) };
      const res = await req(app, env, 'GET', '/api/services/reviews');
      expect(res.status).toBe(200);
    });

    it('POST creates a review', async () => {
      const env = { DB: mockDb({ 'FROM service_items WHERE id': { first: { id: 'i1' } } }) };
      const res = await req(app, env, 'POST', '/api/services/reviews', { service_item_id: 'i1', rating: 5, comment: 'Great' });
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
    });

    it('POST returns 400 missing service_item_id', async () => {
      const env = { DB: mockDb() };
      const res = await req(app, env, 'POST', '/api/services/reviews', { rating: 5 });
      expect(res.status).toBe(400);
    });

    it('POST returns 400 for rating out of range', async () => {
      const env = { DB: mockDb() };
      const res = await req(app, env, 'POST', '/api/services/reviews', { service_item_id: 'i1', rating: 9 });
      expect(res.status).toBe(400);
    });

    it('POST returns 404 for missing item', async () => {
      const env = { DB: mockDb({ 'FROM service_items WHERE id': { first: undefined } }) };
      const res = await req(app, env, 'POST', '/api/services/reviews', { service_item_id: 'i9', rating: 5 });
      expect(res.status).toBe(404);
    });
  });

  // ─── Pricing ───────────────────────────────────────────────
  describe('pricing', () => {
    it('PUT updates pricing tier', async () => {
      const env = { DB: mockDb({ 'FROM service_items WHERE id': { first: { id: 'i1' } } }) };
      const res = await req(app, env, 'PUT', '/api/services/items/i1/pricing', { price_tier: 'premium', price_premium: 50 });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('PUT rejects invalid tier', async () => {
      const env = { DB: mockDb() };
      const res = await req(app, env, 'PUT', '/api/services/items/i1/pricing', { price_tier: 'bogus' });
      expect(res.status).toBe(400);
    });

    it('PUT returns 404 for missing item', async () => {
      const env = { DB: mockDb({ 'FROM service_items WHERE id': { first: undefined } }) };
      const res = await req(app, env, 'PUT', '/api/services/items/i1/pricing', { price_tier: 'standard' });
      expect(res.status).toBe(404);
    });
  });

  // ─── Public catalog ────────────────────────────────────────
  describe('/public/:slug', () => {
    it('returns tenant catalog with definitions and items', async () => {
      let allCalls = 0;
      const env = {
        DB: {
          prepare: vi.fn(() => {
            const chain = {
              bind: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue({ id: 'tee1', name: 'Acacia' }),
              all: vi.fn(() => {
                allCalls++;
                // 1st all() → definitions; 2nd all() (per def) → items
                if (allCalls === 1) {
                  return Promise.resolve({ results: [{ id: 'd1', slug: 'trek', name: 'Trek', description: 'x', fields_schema: '[]' }] });
                }
                return Promise.resolve({ results: [{ id: 'si1', name: 'Tent', description: 'D', base_price: 100, meta_data: '{}' }] });
              }),
            };
            return chain;
          }),
        },
      };
      const res = await req(app, env, 'GET', '/api/services/public/acacia');
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.tenant.name).toBe('Acacia');
      expect(body.definitions[0].items[0].name).toBe('Tent');
    });

    it('returns 404 for unknown slug', async () => {
      const env = { DB: mockDb({ 'FROM tenants WHERE slug': { first: undefined } }) };
      const res = await req(app, env, 'GET', '/api/services/public/unknown');
      expect(res.status).toBe(404);
    });
  });

  // ─── tenant guard on every handler ─────────────────────────
  describe('tenant guard', () => {
    it('returns 400 for no tenant on write endpoints', async () => {
      const appNo = new Hono();
      appNo.route('/api/services', servicesRouter);
      const res = await req(appNo, { DB: mockDb() }, 'POST', '/api/services/definitions', { slug: 'x', name: 'X' });
      expect(res.status).toBe(400);
    });
  });
});
