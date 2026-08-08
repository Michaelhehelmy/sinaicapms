/**
 * Unit tests for meal-categories.js — Meal Category CRUD handler.
 * Tests: handleMealCategoriesRoute with mocked DB for all HTTP methods.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMealCategoriesRoute } from '../../backend/src/api/meal-categories.js';

// ─── Mock Helpers ────────────────────────────────────────────
function createMockDb({ allResults = [], firstResult = null, changes = 1, ownershipResult = [{ id: 'mcat_1' }] } = {}) {
  const runMock = vi.fn().mockResolvedValue({ changes });
  const firstMock = vi.fn().mockResolvedValue(firstResult);
  const allMock = vi.fn().mockResolvedValue({ results: allResults });
  const bindMock = vi.fn().mockReturnValue({ first: firstMock, all: allMock, run: runMock });

  let callCount = 0;
  const prepareMock = vi.fn().mockImplementation((sql) => {
    callCount++;
    // M2 fix: Ownership check is the first prepare() call in PUT/DELETE
    if (sql.includes('SELECT id FROM meal_categories WHERE id = ? AND tenant_id = ?') && callCount === 1) {
      return {
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: ownershipResult }),
        }),
      };
    }
    return { bind: bindMock };
  });

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

// ─── GET /api/meal-categories (list) ─────────────────────────
describe('GET /api/meal-categories', () => {
  it('returns list of meal categories for tenant', async () => {
    const categories = [
      { id: 'mcat_1', name: 'Breakfast', position: 0 },
      { id: 'mcat_2', name: 'Lunch', position: 1 },
    ];
    const { DB } = createMockDb({ allResults: categories });
    const req = makeRequest('GET', '/api/meal-categories');

    const res = await handleMealCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(categories);
  });

  it('returns empty array when no meal categories exist', async () => {
    const { DB } = createMockDb({ allResults: [] });
    const req = makeRequest('GET', '/api/meal-categories');

    const res = await handleMealCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });
});

// ─── GET /api/meal-categories/:id (single) ───────────────────
describe('GET /api/meal-categories/:id', () => {
  it('returns single meal category by id', async () => {
    const category = { id: 'mcat_1', name: 'Breakfast', position: 0 };
    const { DB } = createMockDb({ allResults: [category] });
    const req = makeRequest('GET', '/api/meal-categories/mcat_1');

    const res = await handleMealCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe('mcat_1');
    expect(body.name).toBe('Breakfast');
  });

  it('returns 404 for non-existent meal category', async () => {
    const { DB } = createMockDb({ allResults: [] });
    const req = makeRequest('GET', '/api/meal-categories/mcat_nonexistent');

    const res = await handleMealCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toContain('not found');
  });
});

// ─── POST /api/meal-categories ───────────────────────────────
describe('POST /api/meal-categories', () => {
  it('creates a meal category with valid name', async () => {
    const { DB } = createMockDb();
    const req = makeRequest('POST', '/api/meal-categories', { name: 'Dinner' });

    const res = await handleMealCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.id).toMatch(/^mcat_/);
  });

  it('creates with optional position field', async () => {
    const { DB } = createMockDb();
    const req = makeRequest('POST', '/api/meal-categories', { name: 'Snacks', position: 3 });

    const res = await handleMealCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('rejects missing name', async () => {
    const { DB } = createMockDb();
    const req = makeRequest('POST', '/api/meal-categories', { position: 0 });

    const res = await handleMealCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('Required');
  });
});

// ─── PUT /api/meal-categories/:id ────────────────────────────
describe('PUT /api/meal-categories/:id', () => {
  it('updates meal category name and position', async () => {
    const { DB } = createMockDb();
    const req = makeRequest('PUT', '/api/meal-categories/mcat_1', {
      name: 'Updated Meal',
      position: 5,
    });

    const res = await handleMealCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('updates with only name (position unchanged)', async () => {
    const { DB } = createMockDb();
    const req = makeRequest('PUT', '/api/meal-categories/mcat_1', { name: 'New Name' });

    const res = await handleMealCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('updates with only position (name unchanged)', async () => {
    const { DB } = createMockDb();
    const req = makeRequest('PUT', '/api/meal-categories/mcat_1', { position: 10 });

    const res = await handleMealCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ─── DELETE /api/meal-categories/:id ─────────────────────────
describe('DELETE /api/meal-categories/:id', () => {
  it('deletes a meal category', async () => {
    const { DB } = createMockDb();
    const req = makeRequest('DELETE', '/api/meal-categories/mcat_1');

    const res = await handleMealCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ─── Fallback ────────────────────────────────────────────────
describe('Meal categories route fallback', () => {
  it('returns 405 for unsupported methods', async () => {
    const { DB } = createMockDb();
    const req = makeRequest('PATCH', '/api/meal-categories');

    const res = await handleMealCategoriesRoute(req, { DB }, TENANT_ID);
    const body = await res.json();

    expect(res.status).toBe(405);
  });
});
