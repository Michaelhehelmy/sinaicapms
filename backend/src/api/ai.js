/**
 * AI & Intelligence Module — dynamic pricing, demand forecasting, anomaly detection, automation rules.
 *
 * Endpoints (mounted at /api/ai in index.js):
 *   POST /dynamic-price            suggested optimal price
 *   POST /forecast                 demand forecast
 *   POST /anomaly                  anomaly detection
 *   GET  /price-rules              list price rules
 *   POST /price-rules              create price rule
 *   PUT  /price-rules/:id          update price rule
 *   DELETE /price-rules/:id        delete price rule
 *   GET  /automation-rules         list automation rules
 *   POST /automation-rules         create automation rule
 *   PATCH /automation-rules/:id/activate  toggle rule active
 *   GET  /automation-logs          list execution logs
 *   GET  /predictions              list stored predictions
 *   POST /predictions              store prediction result
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { validationError } from '../utils/errors.js';
import { getScope } from '../middleware/resolveScope.js';

const router = new Hono();

// ── Pure Algorithm Functions ──────────────────────────────────────────────────

/**
 * Calculate dynamic price using simple moving average + demand factor.
 * @param {number} currentPrice
 * @param {number[]} salesHistory - recent daily sales quantities
 * @param {number|null} competitorPrice
 * @returns {{ suggestedPrice: number, confidence: number, factors: object }}
 */
export function calculateDynamicPrice(currentPrice, salesHistory = [], competitorPrice = null) {
  if (salesHistory.length === 0) {
    return { suggestedPrice: currentPrice, confidence: 0.1, factors: { demand: 0, competition: 0 } };
  }

  const avg = salesHistory.reduce((s, v) => s + v, 0) / salesHistory.length;
  const recentAvg = salesHistory.slice(-7).reduce((s, v) => s + v, 0) / Math.min(salesHistory.length, 7);
  const trend = salesHistory.length >= 2 ? (recentAvg - avg) / (avg || 1) : 0;

  let demandFactor = 0;
  if (trend > 0.1) demandFactor = 0.15;
  else if (trend > 0.05) demandFactor = 0.08;
  else if (trend < -0.1) demandFactor = -0.15;
  else if (trend < -0.05) demandFactor = -0.08;

  let competitorFactor = 0;
  if (competitorPrice && competitorPrice > 0) {
    const ratio = currentPrice / competitorPrice;
    if (ratio > 1.15) competitorFactor = -0.10;
    else if (ratio > 1.05) competitorFactor = -0.05;
    else if (ratio < 0.85) competitorFactor = 0.10;
    else if (ratio < 0.95) competitorFactor = 0.05;
  }

  const adjustment = demandFactor + competitorFactor;
  const suggestedPrice = Math.round(currentPrice * (1 + adjustment) * 100) / 100;

  const dataPoints = salesHistory.length;
  let confidence = 0.3;
  if (dataPoints >= 30) confidence = 0.85;
  else if (dataPoints >= 14) confidence = 0.7;
  else if (dataPoints >= 7) confidence = 0.55;

  if (competitorPrice) confidence = Math.min(confidence + 0.1, 0.95);

  return {
    suggestedPrice,
    confidence: Math.round(confidence * 100) / 100,
    factors: {
      demand: Math.round(demandFactor * 100) / 100,
      competition: Math.round(competitorFactor * 100) / 100,
      avgDailySales: Math.round(avg * 100) / 100,
      trend: Math.round(trend * 100) / 100,
    },
  };
}

/**
 * Simple linear regression on time-series data points.
 * @param {{ x: number, y: number }[]} dataPoints
 * @returns {{ slope: number, intercept: number, rSquared: number }}
 */
export function linearRegression(dataPoints) {
  const n = dataPoints.length;
  if (n === 0) return { slope: 0, intercept: 0, rSquared: 0 };
  if (n === 1) return { slope: 0, intercept: dataPoints[0].y, rSquared: 1 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (const pt of dataPoints) {
    sumX += pt.x;
    sumY += pt.y;
    sumXY += pt.x * pt.y;
    sumX2 += pt.x * pt.x;
    sumY2 += pt.y * pt.y;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return { slope: 0, intercept: sumY / n, rSquared: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const ssRes = dataPoints.reduce((s, pt) => {
    const pred = slope * pt.x + intercept;
    return s + (pt.y - pred) ** 2;
  }, 0);
  const meanY = sumY / n;
  const ssTot = dataPoints.reduce((s, pt) => s + (pt.y - meanY) ** 2, 0);
  const rSquared = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  return {
    slope: Math.round(slope * 10000) / 10000,
    intercept: Math.round(intercept * 10000) / 10000,
    rSquared: Math.round(rSquared * 10000) / 10000,
  };
}

/**
 * Z-score anomaly detection.
 * @param {{ field: string, value: number }[]} values
 * @param {number} threshold - z-score threshold (default 2)
 * @returns {{ field: string, expected: number, actual: number, severity: string }[]}
 */
export function detectAnomalies(values, threshold = 2) {
  if (values.length < 3) return [];

  const nums = values.map((v) => v.value);
  const mean = nums.reduce((s, v) => s + v, 0) / nums.length;
  const variance = nums.reduce((s, v) => s + (v - mean) ** 2, 0) / nums.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return [];

  const anomalies = [];
  for (const item of values) {
    const zScore = Math.abs((item.value - mean) / stdDev);
    if (zScore > threshold) {
      anomalies.push({
        field: item.field,
        expected: Math.round(mean * 100) / 100,
        actual: item.value,
        severity: zScore > 3 ? 'critical' : 'warning',
      });
    }
  }
  return anomalies;
}

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const dynamicPriceSchema = z.object({
  productId: z.string().min(1),
  currentPrice: z.number().min(0),
  historicalSales: z.array(z.number()).optional(),
  competitorPrice: z.number().nullable().optional(),
}).strip();

const forecastSchema = z.object({
  productId: z.string().min(1),
  periodDays: z.number().int().min(1).max(365),
}).strip();

const anomalySchema = z.object({
  type: z.enum(['stock', 'orders', 'financials']),
  data: z.array(z.object({ field: z.string(), value: z.number() })),
}).strip();

const priceRuleCreateSchema = z.object({
  name: z.string().min(1).max(200),
  productId: z.string().nullable().optional(),
  ruleType: z.enum(['dynamic', 'time_based', 'demand_based', 'competitor']),
  minPrice: z.number().min(0).nullable().optional(),
  maxPrice: z.number().min(0).nullable().optional(),
  adjustmentPercent: z.number().optional(),
  isActive: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
}).strip();

const priceRuleUpdateSchema = priceRuleCreateSchema.partial().strip();

const automationRuleCreateSchema = z.object({
  name: z.string().min(1).max(200),
  triggerEvent: z.string().min(1).max(200),
  conditionJson: z.string().max(5000).optional(),
  actionJson: z.string().max(5000).optional(),
}).strip();

const automationRuleUpdateSchema = automationRuleCreateSchema.partial().strip();

const predictionCreateSchema = z.object({
  modelType: z.string().min(1).max(100),
  targetId: z.string().nullable().optional(),
  predictedValue: z.string().nullable().optional(),
  inputFeatures: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
}).strip();

// ── Dynamic Pricing ──────────────────────────────────────────────────────────

router.post('/dynamic-price', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = dynamicPriceSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const { productId, currentPrice, historicalSales, competitorPrice } = parsed.data;
  const result = calculateDynamicPrice(currentPrice, historicalSales || [], competitorPrice || null);

  return jsonResponse({
    productId,
    suggestedPrice: result.suggestedPrice,
    confidence: result.confidence,
    factors: result.factors,
  });
});

// ── Forecasting ──────────────────────────────────────────────────────────────

router.post('/forecast', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = forecastSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const { productId, periodDays } = parsed.data;

  // Fetch historical order data from DB
  const { results: orders } = await c.env.DB.prepare(
    `SELECT created_at, quantity FROM order_items
     WHERE product_id = ? AND tenant_id = ?
     ORDER BY created_at DESC`
  ).bind(productId, tenantId).all();

  const dataPoints = [];
  const dailyCounts = {};
  for (const order of (orders || [])) {
    const day = String(order.created_at).slice(0, 10);
    dailyCounts[day] = (dailyCounts[day] || 0) + (order.quantity || 1);
  }

  const days = Object.keys(dailyCounts).sort();
  days.forEach((day, idx) => {
    dataPoints.push({ x: idx, y: dailyCounts[day] });
  });

  const { slope, intercept, rSquared } = linearRegression(dataPoints);
  const forecasts = [];
  const baseDate = new Date();

  for (let i = 1; i <= periodDays; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + i);
    const predictedDemand = Math.max(0, Math.round((slope * (days.length + i) + intercept) * 100) / 100);
    const confidenceDrop = Math.max(0.1, rSquared - i * 0.003);
    forecasts.push({
      date: date.toISOString().slice(0, 10),
      predictedDemand,
      confidence: Math.round(confidenceDrop * 100) / 100,
    });
  }

  return jsonResponse({ productId, periodDays, forecasts, model: { slope, intercept, rSquared } });
});

// ── Anomaly Detection ────────────────────────────────────────────────────────

router.post('/anomaly', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = anomalySchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const { data } = parsed.data;
  const anomalies = detectAnomalies(data);

  return jsonResponse({ anomalies, checked: data.length });
});

// ── Price Rules CRUD ─────────────────────────────────────────────────────────

router.get('/price-rules', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM price_rules WHERE tenant_id = ? ORDER BY created_at DESC'
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

router.post('/price-rules', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = priceRuleCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const { name, productId, ruleType, minPrice, maxPrice, adjustmentPercent, isActive } = parsed.data;
  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO price_rules (id, tenant_id, name, product_id, rule_type, min_price, max_price, adjustment_percent, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, tenantId, name, productId || null, ruleType, minPrice || null, maxPrice || null, adjustmentPercent || 0, isActive !== undefined ? (isActive ? 1 : 0) : 1).run();

  return jsonResponse({
    id, name, productId: productId || null, ruleType, minPrice: minPrice || null,
    maxPrice: maxPrice || null, adjustmentPercent: adjustmentPercent || 0, isActive: 1, success: true,
  }, 201);
});

router.put('/price-rules/:id', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = priceRuleUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const existing = await c.env.DB.prepare(
    'SELECT id FROM price_rules WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) return errorResponse('Price rule not found', 404);

  const data = parsed.data;
  const sets = [];
  const binds = [];
  if (data.name !== undefined) { sets.push('name = ?'); binds.push(data.name); }
  if (data.productId !== undefined) { sets.push('product_id = ?'); binds.push(data.productId); }
  if (data.ruleType !== undefined) { sets.push('rule_type = ?'); binds.push(data.ruleType); }
  if (data.minPrice !== undefined) { sets.push('min_price = ?'); binds.push(data.minPrice); }
  if (data.maxPrice !== undefined) { sets.push('max_price = ?'); binds.push(data.maxPrice); }
  if (data.adjustmentPercent !== undefined) { sets.push('adjustment_percent = ?'); binds.push(data.adjustmentPercent); }
  if (data.isActive !== undefined) { sets.push('is_active = ?'); binds.push(data.isActive ? 1 : 0); }
  if (sets.length === 0) return jsonResponse({ success: true });

  binds.push(id, tenantId);
  await c.env.DB.prepare(
    `UPDATE price_rules SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...binds).run();

  return jsonResponse({ success: true });
});

router.delete('/price-rules/:id', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();

  const existing = await c.env.DB.prepare(
    'SELECT id FROM price_rules WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) return errorResponse('Price rule not found', 404);

  await c.env.DB.prepare(
    'DELETE FROM price_rules WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).run();

  return jsonResponse({ success: true });
});

// ── Automation Rules CRUD ────────────────────────────────────────────────────

router.get('/automation-rules', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM automation_rules WHERE tenant_id = ? ORDER BY created_at DESC'
  ).bind(tenantId).all();
  return jsonResponse(rows.results || []);
});

router.post('/automation-rules', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = automationRuleCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const { name, triggerEvent, conditionJson, actionJson } = parsed.data;
  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO automation_rules (id, tenant_id, name, trigger_event, condition_json, action_json)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, tenantId, name, triggerEvent, conditionJson || null, actionJson || null).run();

  return jsonResponse({
    id, name, triggerEvent, conditionJson: conditionJson || null, actionJson: actionJson || null,
    isActive: 1, triggerCount: 0, success: true,
  }, 201);
});

router.patch('/automation-rules/:id/activate', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { id } = c.req.param();

  const existing = await c.env.DB.prepare(
    'SELECT id, is_active FROM automation_rules WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();
  if (!existing) return errorResponse('Automation rule not found', 404);

  const newState = existing.is_active ? 0 : 1;
  await c.env.DB.prepare(
    'UPDATE automation_rules SET is_active = ? WHERE id = ? AND tenant_id = ?'
  ).bind(newState, id, tenantId).run();

  return jsonResponse({ id, isActive: newState, success: true });
});

// ── Automation Logs ──────────────────────────────────────────────────────────

router.get('/automation-logs', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);

  const url = new URL(c.req.url);
  const ruleId = url.searchParams.get('ruleId');

  let sql = 'SELECT al.*, ar.name as rule_name FROM automation_logs al LEFT JOIN automation_rules ar ON al.rule_id = ar.id WHERE al.tenant_id = ?';
  const binds = [tenantId];
  if (ruleId) { sql += ' AND al.rule_id = ?'; binds.push(ruleId); }
  sql += ' ORDER BY al.created_at DESC LIMIT 100';

  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  return jsonResponse(rows.results || []);
});

// ── Predictions Storage ──────────────────────────────────────────────────────

router.get('/predictions', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);

  const url = new URL(c.req.url);
  const modelType = url.searchParams.get('modelType');

  let sql = 'SELECT * FROM predictions WHERE tenant_id = ?';
  const binds = [tenantId];
  if (modelType) { sql += ' AND model_type = ?'; binds.push(modelType); }
  sql += ' ORDER BY created_at DESC LIMIT 100';

  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  return jsonResponse(rows.results || []);
});

router.post('/predictions', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const parsed = predictionCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  const { modelType, targetId, predictedValue, inputFeatures, confidence } = parsed.data;
  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO predictions (id, tenant_id, model_type, target_id, predicted_value, input_features, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, tenantId, modelType, targetId || null, predictedValue || null, inputFeatures || null, confidence || 0).run();

  return jsonResponse({
    id, modelType, targetId: targetId || null, predictedValue: predictedValue || null,
    inputFeatures: inputFeatures || null, confidence: confidence || 0, success: true,
  }, 201);
});

// ── Workers AI Integration (Stub) ───────────────────────────────────────────
// Stub for Cloudflare Workers AI integration.
// When AI binding is available in wrangler.toml, this can use:
//   c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages: [...] })
// For now, returns mock responses for demonstration.

router.post('/workers-ai/analyze', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const { prompt, model, maxTokens } = body;

  if (!prompt) return errorResponse('Prompt is required', 400);

  // Stub: In production, this would call c.env.AI.run()
  // const aiResponse = await c.env.AI.run(model || '@cf/meta/llama-3.1-8b-instruct', {
  //   messages: [{ role: 'user', content: prompt }],
  //   max_tokens: maxTokens || 1024,
  // });

  const stubResponse = {
    id: crypto.randomUUID(),
    model: model || '@cf/meta/llama-3.1-8b-instruct',
    response: `[Stub] AI analysis for: "${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}". In production, this would use Workers AI to generate a real response.`,
    tokens_used: Math.ceil(prompt.length / 4),
    created_at: new Date().toISOString(),
  };

  return jsonResponse({
    ...stubResponse,
    message: 'Workers AI stub response. Set AI binding in wrangler.toml for real AI capabilities.',
    success: true,
  });
});

router.post('/workers-ai/embeddings', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const { text, model } = body;

  if (!text) return errorResponse('Text is required', 400);

  // Stub: In production, this would call c.env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [text] })
  // const embedding = await c.env.AI.run(model || '@cf/baai/bge-base-en-v1.5', { text: [text] });

  // Generate a deterministic mock embedding (768 dimensions)
  const mockEmbedding = Array.from({ length: 768 }, (_, i) => {
    const seed = (text.charCodeAt(i % text.length) * (i + 1)) % 1000;
    return Math.round((seed / 500 - 1) * 100) / 100;
  });

  return jsonResponse({
    id: crypto.randomUUID(),
    model: model || '@cf/baai/bge-base-en-v1.5',
    embeddings: [mockEmbedding],
    dimensions: 768,
    message: 'Embeddings stub response. Set AI binding in wrangler.toml for real embeddings.',
    success: true,
  });
});

// ── Durable Objects State (Stub) ────────────────────────────────────────────
// Stub for Durable Objects integration for real-time state management.
// When DO bindings are available in wrangler.toml, this can use:
//   const id = c.env.STATE_DO.idFromName(tenantId);
//   const stub = c.env.STATE_DO.get(id);
//   await stub.fetch(request)

router.get('/state/sessions', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);

  // Stub: In production, this would query a Durable Object for real-time sessions
  // const id = c.env.STATE_DO.idFromName(`sessions:${tenantId}`);
  // const stub = c.env.STATE_DO.get(id);
  // const response = await stub.fetch(new Request('http://do/sessions'));
  // return response;

  return jsonResponse({
    sessions: [],
    total: 0,
    message: 'Durable Objects stub. Add STATE_DO binding to wrangler.toml for real-time state.',
    success: true,
  });
});

router.post('/state/sync', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const body = await c.req.json();
  const { key, value, ttl } = body;

  if (!key) return errorResponse('Key is required', 400);

  // Stub: In production, this would write to a Durable Object
  // const id = c.env.STATE_DO.idFromName(`state:${tenantId}`);
  // const stub = c.env.STATE_DO.get(id);
  // await stub.fetch(new Request('http://do/set', { method: 'POST', body: JSON.stringify({ key, value, ttl }) }));

  return jsonResponse({
    key,
    stored: true,
    ttl: ttl || 3600,
    message: 'State sync stub. Add STATE_DO binding to wrangler.toml for real-time state.',
    success: true,
  });
});

router.get('/state/sync/:key', async (c) => {
  const scope = getScope(c);
  const tenantId = scope.tenantId;
  if (!tenantId) return errorResponse('Tenant ID required', 400);
  const { key } = c.req.param();

  // Stub: In production, this would read from a Durable Object
  // const id = c.env.STATE_DO.idFromName(`state:${tenantId}`);
  // const stub = c.env.STATE_DO.get(id);
  // const response = await stub.fetch(new Request(`http://do/get/${key}`));

  return jsonResponse({
    key,
    value: null,
    found: false,
    message: 'State read stub. Add STATE_DO binding to wrangler.toml for real-time state.',
    success: true,
  });
});

export default router;
