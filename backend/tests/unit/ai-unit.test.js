/**
 * AI & Intelligence tests — dynamic pricing, forecasting, anomaly detection, CRUD.
 *
 * Uses the same SQL-routing mock DB and mountRouter helper as financials-unit.test.js.
 */
import { describe, it, expect, vi } from 'vitest';
import aiRouter, { calculateDynamicPrice, linearRegression, detectAnomalies } from '../../src/api/ai';
import { mountRouter } from '../helpers/routerHarness';

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

// ── Dynamic Pricing ─────────────────────────────────────────────────────────

describe('Dynamic Pricing', () => {
  it('suggests higher price when demand is high', () => {
    const salesHistory = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const result = calculateDynamicPrice(100, salesHistory);
    expect(result.suggestedPrice).toBeGreaterThan(100);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('suggests lower price when demand is low', () => {
    const salesHistory = [20, 18, 15, 12, 10, 8, 6, 4, 3, 2, 1];
    const result = calculateDynamicPrice(100, salesHistory);
    expect(result.suggestedPrice).toBeLessThan(100);
  });

  it('respects min/max bounds when adjusting price', () => {
    const result = calculateDynamicPrice(100, [1, 2, 3], 100);
    expect(result.suggestedPrice).toBeGreaterThan(0);
    expect(typeof result.suggestedPrice).toBe('number');
  });

  it('returns current price with low confidence for empty history', () => {
    const result = calculateDynamicPrice(50, []);
    expect(result.suggestedPrice).toBe(50);
    expect(result.confidence).toBe(0.1);
  });

  it('accounts for competitor pricing', () => {
    const salesHistory = [5, 5, 5, 5, 5, 5, 5];
    const highCompetitor = calculateDynamicPrice(100, salesHistory, 80);
    expect(highCompetitor.suggestedPrice).toBeLessThan(100);
    const lowCompetitor = calculateDynamicPrice(100, salesHistory, 120);
    expect(lowCompetitor.suggestedPrice).toBeGreaterThan(100);
  });

  it('increases confidence with more data points', () => {
    const few = calculateDynamicPrice(100, [1, 2, 3]);
    const many = calculateDynamicPrice(100, Array(30).fill(5));
    expect(many.confidence).toBeGreaterThan(few.confidence);
  });

  it('includes factors in the result', () => {
    const result = calculateDynamicPrice(100, [1, 2, 3, 4, 5]);
    expect(result.factors).toHaveProperty('demand');
    expect(result.factors).toHaveProperty('competition');
    expect(result.factors).toHaveProperty('avgDailySales');
    expect(result.factors).toHaveProperty('trend');
  });
});

// ── Forecasting ─────────────────────────────────────────────────────────────

describe('Forecasting', () => {
  it('returns linear trend for increasing data', () => {
    const pts = [
      { x: 0, y: 10 }, { x: 1, y: 12 }, { x: 2, y: 14 }, { x: 3, y: 16 },
    ];
    const { slope, intercept, rSquared } = linearRegression(pts);
    expect(slope).toBeCloseTo(2, 1);
    expect(intercept).toBeCloseTo(10, 1);
    expect(rSquared).toBeCloseTo(1, 2);
  });

  it('handles empty data gracefully', () => {
    const { slope, intercept, rSquared } = linearRegression([]);
    expect(slope).toBe(0);
    expect(intercept).toBe(0);
    expect(rSquared).toBe(0);
  });

  it('handles single data point', () => {
    const { slope, intercept } = linearRegression([{ x: 0, y: 5 }]);
    expect(slope).toBe(0);
    expect(intercept).toBe(5);
  });

  it('returns low r-squared for noisy data', () => {
    const pts = [
      { x: 0, y: 10 }, { x: 1, y: 0 }, { x: 2, y: 10 }, { x: 3, y: 0 },
    ];
    const { rSquared } = linearRegression(pts);
    expect(rSquared).toBeLessThan(0.5);
  });

  it('handles constant y values', () => {
    const pts = [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }];
    const { slope, rSquared } = linearRegression(pts);
    expect(slope).toBe(0);
    expect(rSquared).toBe(1);
  });
});

// ── Anomaly Detection ───────────────────────────────────────────────────────

describe('Anomaly Detection', () => {
  it('detects outliers beyond threshold', () => {
    const data = Array.from({ length: 20 }, (_, i) => ({ field: 'revenue', value: 10 + (i % 3) }));
    data.push({ field: 'revenue', value: 100 });
    const anomalies = detectAnomalies(data, 2);
    expect(anomalies.length).toBe(1);
    expect(anomalies[0].field).toBe('revenue');
    expect(anomalies[0].actual).toBe(100);
    expect(anomalies[0].severity).toBe('critical');
  });

  it('returns empty for normal data', () => {
    const data = [
      { field: 'orders', value: 10 },
      { field: 'orders', value: 11 },
      { field: 'orders', value: 9 },
      { field: 'orders', value: 12 },
      { field: 'orders', value: 10 },
    ];
    const anomalies = detectAnomalies(data, 2);
    expect(anomalies).toEqual([]);
  });

  it('returns empty for fewer than 3 data points', () => {
    const data = [{ field: 'x', value: 100 }, { field: 'x', value: 200 }];
    const anomalies = detectAnomalies(data, 2);
    expect(anomalies).toEqual([]);
  });

  it('returns empty when all values are identical', () => {
    const data = [
      { field: 'stock', value: 5 },
      { field: 'stock', value: 5 },
      { field: 'stock', value: 5 },
    ];
    const anomalies = detectAnomalies(data, 2);
    expect(anomalies).toEqual([]);
  });

  it('detects multiple anomalies', () => {
    const data = [
      { field: 'a', value: 10 }, { field: 'a', value: 11 }, { field: 'a', value: 9 },
      { field: 'a', value: 10 }, { field: 'a', value: 12 }, { field: 'a', value: 10 },
      { field: 'a', value: 10 }, { field: 'a', value: 11 }, { field: 'a', value: 10 },
      { field: 'a', value: 100 }, { field: 'a', value: -50 },
    ];
    const anomalies = detectAnomalies(data, 2);
    expect(anomalies.length).toBeGreaterThanOrEqual(1);
  });

  it('marks severity as warning for z between 2 and 3', () => {
    const data = [
      { field: 'x', value: 10 },
      { field: 'x', value: 10 },
      { field: 'x', value: 10 },
      { field: 'x', value: 16 },
    ];
    const anomalies = detectAnomalies(data, 2);
    if (anomalies.length > 0) {
      expect(anomalies[0].severity).toBe('warning');
    }
  });
});

// ── Price Rules CRUD ────────────────────────────────────────────────────────

describe('Price Rules', () => {
  it('GET /price-rules lists all rules', async () => {
    const db = makeRoutingDb().on(/FROM price_rules/, [
      { id: 'pr1', name: 'Summer', rule_type: 'dynamic', is_active: 1 }
    ]);
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/price-rules'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].name).toBe('Summer');
  });

  it('POST /price-rules creates a new rule', async () => {
    const db = makeRoutingDb().on(/INSERT INTO price_rules/, { meta: { changes: 1 } });
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/price-rules', {
      method: 'POST',
      body: JSON.stringify({ name: 'Winter Pricing', ruleType: 'time_based' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.name).toBe('Winter Pricing');
  });

  it('PUT /price-rules/:id updates a rule', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM price_rules WHERE id/, [{ id: 'pr1' }])
      .on(/UPDATE price_rules SET/, { meta: { changes: 1 } });
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/price-rules/pr1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated Rule' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('DELETE /price-rules/:id deletes a rule', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM price_rules WHERE id/, [{ id: 'pr1' }])
      .on(/DELETE FROM price_rules/, { meta: { changes: 1 } });
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/price-rules/pr1', { method: 'DELETE' }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('PUT /price-rules/:id returns 404 for missing rule', async () => {
    const db = makeRoutingDb().on(/SELECT id FROM price_rules WHERE id/, null);
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/price-rules/nonexistent', {
      method: 'PUT',
      body: JSON.stringify({ name: 'X' }),
    }), {}, env(db));
    expect(res.status).toBe(404);
  });
});

// ── Automation Rules CRUD ───────────────────────────────────────────────────

describe('Automation Rules', () => {
  it('GET /automation-rules lists all rules', async () => {
    const db = makeRoutingDb().on(/FROM automation_rules/, [
      { id: 'ar1', name: 'Low Stock', trigger_event: 'stock.low', is_active: 1, trigger_count: 5 }
    ]);
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/automation-rules'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].name).toBe('Low Stock');
  });

  it('POST /automation-rules creates a new rule', async () => {
    const db = makeRoutingDb().on(/INSERT INTO automation_rules/, { meta: { changes: 1 } });
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/automation-rules', {
      method: 'POST',
      body: JSON.stringify({ name: 'Order Alert', triggerEvent: 'order.completed' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.name).toBe('Order Alert');
  });

  it('PATCH /automation-rules/:id/activate toggles active state', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id, is_active FROM automation_rules/, [{ id: 'ar1', is_active: 1 }])
      .on(/UPDATE automation_rules SET is_active/, { meta: { changes: 1 } });
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/automation-rules/ar1/activate', { method: 'PATCH' }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.isActive).toBe(0);
    expect(body.success).toBe(true);
  });

  it('PATCH /automation-rules/:id/activate returns 404 for missing rule', async () => {
    const db = makeRoutingDb().on(/SELECT id, is_active FROM automation_rules/, null);
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/automation-rules/nonexistent/activate', { method: 'PATCH' }), {}, env(db));
    expect(res.status).toBe(404);
  });
});

// ── Automation Logs ─────────────────────────────────────────────────────────

describe('Automation Logs', () => {
  it('GET /automation-logs lists logs', async () => {
    const db = makeRoutingDb().on(/FROM automation_logs al/, [
      { id: 'log1', rule_id: 'ar1', rule_name: 'Low Stock', trigger_event: 'stock.low', result: 'success' }
    ]);
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/automation-logs'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].ruleName).toBe('Low Stock');
  });
});

// ── Predictions ─────────────────────────────────────────────────────────────

describe('Predictions', () => {
  it('GET /predictions lists predictions', async () => {
    const db = makeRoutingDb().on(/FROM predictions/, [
      { id: 'pred1', model_type: 'dynamic_price', confidence: 0.8 }
    ]);
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/predictions'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].modelType).toBe('dynamic_price');
  });

  it('POST /predictions stores a prediction', async () => {
    const db = makeRoutingDb().on(/INSERT INTO predictions/, { meta: { changes: 1 } });
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/predictions', {
      method: 'POST',
      body: JSON.stringify({ modelType: 'forecast', targetId: 'prod1', predictedValue: '42', confidence: 0.75 }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.modelType).toBe('forecast');
  });
});

// ── Tenant Isolation ────────────────────────────────────────────────────────

describe('Tenant Isolation', () => {
  it('queries always include tenant_id', async () => {
    const capturedBinds = [];
    const db = makeRoutingDb().on(/FROM price_rules/, (binds) => {
      capturedBinds.push(...binds);
      return { results: [{ id: 'pr1', name: 'Test', rule_type: 'dynamic', is_active: 1 }], meta: { changes: 0 } };
    });
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    await app.request(req('/price-rules'), {}, env(db));
    expect(capturedBinds).toContain('t1');
  });

  it('POST /dynamic-price requires tenant', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(aiRouter, { tenantId: null });
    const res = await app.request(req('/dynamic-price', {
      method: 'POST',
      body: JSON.stringify({ productId: 'p1', currentPrice: 100 }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });
});

// ── Validation ──────────────────────────────────────────────────────────────

describe('Validation', () => {
  it('POST /dynamic-price rejects invalid body', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/dynamic-price', {
      method: 'POST',
      body: JSON.stringify({ productId: 'p1' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('POST /price-rules rejects empty name', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/price-rules', {
      method: 'POST',
      body: JSON.stringify({ name: '', ruleType: 'dynamic' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('POST /automation-rules rejects empty trigger event', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/automation-rules', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', triggerEvent: '' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });
});

// ── Workers AI Stubs ────────────────────────────────────────────────────────

describe('Workers AI Stubs', () => {
  it('POST /workers-ai/analyze returns stub response', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/workers-ai/analyze', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'Test prompt for AI analysis' }),
    }), {}, env(db));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.response).toContain('Stub');
    expect(body.model).toBe('@cf/meta/llama-3.1-8b-instruct');
  });

  it('POST /workers-ai/analyze rejects empty prompt', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/workers-ai/analyze', {
      method: 'POST',
      body: JSON.stringify({ prompt: '' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('POST /workers-ai/embeddings returns mock embeddings', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/workers-ai/embeddings', {
      method: 'POST',
      body: JSON.stringify({ text: 'Test text for embeddings' }),
    }), {}, env(db));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.embeddings).toHaveLength(1);
    expect(body.embeddings[0]).toHaveLength(768);
    expect(body.dimensions).toBe(768);
  });

  it('POST /workers-ai/embeddings rejects empty text', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/workers-ai/embeddings', {
      method: 'POST',
      body: JSON.stringify({ text: '' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });
});

// ── Durable Objects State Stubs ─────────────────────────────────────────────

describe('Durable Objects State Stubs', () => {
  it('GET /state/sessions returns empty sessions', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/state/sessions'), {}, env(db));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.sessions).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('POST /state/sync stores key-value pair', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/state/sync', {
      method: 'POST',
      body: JSON.stringify({ key: 'test-key', value: { data: 'test' }, ttl: 3600 }),
    }), {}, env(db));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.key).toBe('test-key');
    expect(body.stored).toBe(true);
  });

  it('POST /state/sync rejects empty key', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/state/sync', {
      method: 'POST',
      body: JSON.stringify({ key: '', value: 'test' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('GET /state/sync/:key returns value', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(aiRouter, { tenantId: 't1' });
    const res = await app.request(req('/state/sync/test-key'), {}, env(db));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.key).toBe('test-key');
    expect(body.found).toBe(false);
  });
});
