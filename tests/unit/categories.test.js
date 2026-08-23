/**
 * Unit tests for categories.js — Category CRUD handler.
 * Tests: handleCategoriesRoute with mocked DB for all HTTP methods.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import categoriesRoutes from '../../backend/src/api/categories.js';;

// Signature-compatible shim: legacy handlers took (Request, env, tenantId).
// They now execute against the Hono sub-router mounted by index.js.
import { mountRouter } from '../../backend/tests/helpers/routerHarness.js';

const __app = mountRouter(categoriesRoutes, { tenantId: 'tenant_1', basePath: '/api/categories' });

async function dispatch(req, env = {}) {
  const url = new URL(req.url);
  const init = { method: req.method, headers: req.headers };
  if (!['GET', 'HEAD', 'DELETE'].includes(req.method)) {
    try { init.body = JSON.stringify(await req.json()); } catch { /* passthrough */ }
  }
  return __app.request(url.pathname + url.search, init, env);
}

async function handleCategoriesRoute(req, env = {}, _tenant = null) {
  return dispatch(req, env);
}

// ─── Mock Helpers ────────────────────────────────────────────
function createMockDb({ allResults = [], firstResult = null, changes = 1 } = {}) {
  const runMock = vi.fn().mockResolvedValue({ changes });
  const firstMock = vi.fn().mockResolvedValue(firstResult);
  const allMock = vi.fn().mockResolvedValue({ results: allResults });
  const bindMock = vi.fn().mockReturnValue({ first: firstMock, all: allMock, run: runMock });
  const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });
  return {
    DB: { prepare: prepareMock },
    _prepareMock: prepareMock,
    _bindMock: bindMock,
    _runMock: runMock,
  };
}

function makeRequest(method, path, body = null) {
  const url = `http://localhost${path}`;
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

const TENANT_ID = 'tenant_1';

// ─── GET /api/categories (list) ──────────────────────────────
describe('GET /api/categories', () => {
  it('returns list of categories for tenant', async () => {
    const categories = [
      { id: 'cat_1', name: 'Camping Gear', parentId: null, active: 1 },
      { id: 'cat_2', name: 'Food', parentId: null, active: 1 },
    ];
    const { DB } = createMockDb({ allResults: categories });
    const req = makeRequest('GET', '/api/categories');

    const res = await handleCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(categories);
  });

  it('returns empty array when no categories exist', async () => {
    const { DB } = createMockDb({ allResults: [] });
    const req = makeRequest('GET', '/api/categories');

    const res = await handleCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });
});

// ─── GET /api/categories/:id (single) ────────────────────────
describe('GET /api/categories/:id', () => {
  it('returns single category by id', async () => {
    const category = { id: 'cat_1', name: 'Tent', description: 'Camping tent' };
    const { DB } = createMockDb({ allResults: [category] });
    const req = makeRequest('GET', '/api/categories/cat_1');

    const res = await handleCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe('cat_1');
    expect(body.name).toBe('Tent');
  });

  it('returns 404 for non-existent category', async () => {
    const { DB } = createMockDb({ allResults: [] });
    const req = makeRequest('GET', '/api/categories/cat_nonexistent');

    const res = await handleCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toContain('not found');
  });
});

// ─── POST /api/categories ────────────────────────────────────
describe('POST /api/categories', () => {
  it('creates a category with valid name', async () => {
    const { DB } = createMockDb();
    const req = makeRequest('POST', '/api/categories', { name: 'New Category' });

    const res = await handleCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.id).toMatch(/^cat_/);
  });

  it('creates category with optional fields', async () => {
    const { DB } = createMockDb();
    const req = makeRequest('POST', '/api/categories', {
      name: 'Parent Category',
      description: 'A parent',
      parent_id: 'cat_parent',
      active: 0,
      position: 5,
    });

    const res = await handleCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('rejects missing name', async () => {
    const { DB } = createMockDb();
    const req = makeRequest('POST', '/api/categories', { description: 'No name' });

    const res = await handleCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('Required');
  });
});

// ─── PUT /api/categories/:id ─────────────────────────────────
describe('PUT /api/categories/:id', () => {
  it('updates an existing category', async () => {
    const { DB, _prepareMock } = createMockDb({ allResults: [{ id: 'cat_1' }] });
    const req = makeRequest('PUT', '/api/categories/cat_1', { name: 'Updated Name' });

    const res = await handleCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 404 for non-existent category', async () => {
    const { DB } = createMockDb({ allResults: [] });
    const req = makeRequest('PUT', '/api/categories/cat_nonexistent', { name: 'Test' });

    const res = await handleCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toContain('not found');
  });
});

// ─── DELETE /api/categories/:id ──────────────────────────────
describe('DELETE /api/categories/:id', () => {
  it('deletes a tenant-owned category', async () => {
    // DELETE makes two prepare calls: (1) check ownership, (2) check product refs
    // We need ownership check to return the category, and product refs to return empty
    const ownershipCheck = { all: vi.fn().mockResolvedValue({ results: [{ id: 'cat_1' }] }) };
    const productRefsCheck = { all: vi.fn().mockResolvedValue({ results: [] }) };
    const langDelete = { run: vi.fn().mockResolvedValue({ changes: 1 }) };
    const catDelete = { run: vi.fn().mockResolvedValue({ changes: 1 }) };

    let callCount = 0;
    const prepareMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return { bind: vi.fn().mockReturnValue(ownershipCheck) };
      if (callCount === 2) return { bind: vi.fn().mockReturnValue(productRefsCheck) };
      // DELETE FROM category_lang and DELETE FROM categories
      return { bind: vi.fn().mockReturnValue(callCount <= 3 ? langDelete : catDelete) };
    });
    const DB = { prepare: prepareMock };

    const req = makeRequest('DELETE', '/api/categories/cat_1');
    const res = await handleCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 404 when category not found', async () => {
    const { DB } = createMockDb({ allResults: [] });
    const req = makeRequest('DELETE', '/api/categories/cat_nonexistent');

    const res = await handleCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(404);
  });
});

// ─── Fallback ────────────────────────────────────────────────
describe('Categories route fallback', () => {
  it('returns 405 for unsupported methods', async () => {
    const { DB } = createMockDb();
    const req = makeRequest('PATCH', '/api/categories');

    const res = await handleCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(405);
  });
});
