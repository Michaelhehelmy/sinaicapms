import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { getTenant } from './middleware/tenant';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { handleAuthRoute, verifyJWT } from './api/auth';
import { handleTenants, handleMe } from './api/tenants';
import { handleAdminRoute } from './api/admin';
import { handleCampsRoute, handleProductsRoute, handleRoomsRoute, handleRatePlansRoute } from './api/camps';
import { handleOrdersRoute, handleAvailability } from './api/orders';
import { handlePriceOverridesRoute } from './api/priceOverrides';
import { handleUploadRoute, handleMediaRoute } from './api/upload';
import { handleMealsRoute } from './api/meals';
import { handleMealSchedulesRoute } from './api/meal-schedules';
import { handlePosUsersRoute } from './api/pos-users';
import { handlePlansRoute } from './api/others';
import { handleCategoriesRoute } from './api/categories';
import { handleMealCategoriesRoute } from './api/meal-categories';
import { jsonResponse, errorResponse } from './utils/response';
import { handleCreatePaymentIntent, handleConfirmPayment, handleStripeWebhook } from './api/payments';
import { handleReportsRoute } from './api/reports';
import { handleInventoryRoute } from './api/inventory';
import { handleLeadsRoute } from './api/leads';
import { handleInboxRoute } from './api/inbox';
import { buildOpenApiDocument } from './routes/registry';
import posRoutes from './routes/pos/index.js';
import { Broadcaster } from './durable/broadcaster.js';

// Durable Object class export — required so `wrangler deploy` can register the
// BROADCASTER binding (`class_name = "Broadcaster"`) from the entrypoint.
export { Broadcaster };

const app = new Hono();

const DEFAULT_ORIGINS = [
  'http://localhost:8000',
  'http://localhost:8001',
  'http://localhost:4320',
  'http://localhost:5173',
  'https://sinaicamps.com',
  'https://*.sinaicamps.com'
];

// Pre-compile wildcard origin regexes (P-L2: avoid recompilation per request)
const WILDCARD_ORIGINS = DEFAULT_ORIGINS
  .filter(p => p.includes('*'))
  .map(pattern => ({
    pattern,
    regex: new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '[^.]+') + '$')
  }));
const EXACT_ORIGINS = DEFAULT_ORIGINS.filter(p => !p.includes('*'));

// Cache for custom domain origins (refresh every 5 minutes)
let _customDomainCache = null;
let _customDomainCacheTime = 0;
const CUSTOM_DOMAIN_CACHE_TTL = 5 * 60 * 1000;

async function getAllowedCustomDomains(env) {
  const now = Date.now();
  if (_customDomainCache && (now - _customDomainCacheTime) < CUSTOM_DOMAIN_CACHE_TTL) {
    return _customDomainCache;
  }
  try {
    const { results } = await env.DB.prepare(
      "SELECT custom_domain FROM tenants WHERE custom_domain IS NOT NULL AND custom_domain != ''"
    ).all();
    _customDomainCache = results.map(r => r.custom_domain);
    _customDomainCacheTime = now;
  } catch (e) {
    // If DB query fails, return cached or empty
    _customDomainCache = _customDomainCache || [];
  }
  return _customDomainCache;
}

app.use('*', cors({
  origin: async (origin, _c) => {
    if (!origin) return null;
    for (const { regex } of WILDCARD_ORIGINS) {
      if (regex.test(origin)) return origin;
    }
    if (EXACT_ORIGINS.includes(origin)) return origin;
    // Dynamic check against registered custom domains (with 5-min cache)
    try {
      const customDomains = await getAllowedCustomDomains(_c.env);
      const hostname = new URL(origin).hostname;
      if (customDomains.includes(hostname)) return origin;
    } catch {}
    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'x-tenant-id', 'Authorization'],
  maxAge: 86400,
}));

app.get('/', (c) => c.html(`<!DOCTYPE html>
<html><head><title>SinaiCamps API</title></head>
<body style="font-family: sans-serif; text-align: center; padding: 50px; background: #f8f9fa;">
  <h1>SinaiCamps API</h1>
  <p>Serverless API worker is running.</p>
</body></html>`));

// ── Auth routes (rate-limited) ────────────────────────────
app.all('/api/auth/*', rateLimitMiddleware({ windowMs: 60000, max: 30 }), async (c) => {
  return handleAuthRoute(c.req.raw, c.env);
});

// ── Tenant routes (S-C1 fix: only explicit GET + POST, no app.all shadow) ──
const handleTenantsRoute = async (c) => handleTenants(c.req.raw, c.env);
app.post('/api/tenants', rateLimitMiddleware({ windowMs: 300000, max: 5 }), handleTenantsRoute);
app.get('/api/tenants', rateLimitMiddleware({ windowMs: 60000, max: 60 }), handleTenantsRoute);
app.get('/api/tenants/*', rateLimitMiddleware({ windowMs: 60000, max: 60 }), handleTenantsRoute);

// ── Admin routes (rate-limited, super-admin only) ─────────
app.use('/api/admin/*', rateLimitMiddleware({ windowMs: 60000, max: 20 }));
const handleSuperAdminRoute = async (c) => handleAdminRoute(c.req.raw, c.env);
app.all('/api/admin', handleSuperAdminRoute);
app.all('/api/admin/*', handleSuperAdminRoute);

// ── Payment routes ────────────────────────────────────────
app.use('/api/payments/*', rateLimitMiddleware({ windowMs: 60000, max: 20 }));

app.post('/api/payments/create-intent', async (c) => {
  const tenantId = await getTenant(c.req.raw, c.env);
  if (!tenantId) return errorResponse('Tenant not found', 404);
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse('Missing or invalid Authorization header', 401);
  }
  const token = authHeader.split(' ')[1];
  const decoded = await verifyJWT(token, c.env.JWT_SECRET);
  if (!decoded) return errorResponse('Session expired or invalid signature', 401);
  if (decoded.posType === 'pos') return errorResponse('Forbidden: POS sessions cannot access payment routes', 403);
  if (decoded.role !== 'super_admin' && decoded.tenantId !== tenantId) return errorResponse('Forbidden: Access denied to this tenant', 403);
  return handleCreatePaymentIntent(c.req.raw, c.env, tenantId);
});

app.post('/api/payments/create-checkout', async (c) => {
  const tenantId = await getTenant(c.req.raw, c.env);
  if (!tenantId) return errorResponse('Unauthorized: missing tenant context', 401);
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse('Missing or invalid Authorization header', 401);
  }
  const token = authHeader.split(' ')[1];
  const decoded = await verifyJWT(token, c.env.JWT_SECRET);
  if (!decoded) return errorResponse('Session expired or invalid signature', 401);
  if (decoded.posType === 'pos') return errorResponse('Forbidden: POS sessions cannot access payment routes', 403);
  if (decoded.role !== 'super_admin' && decoded.tenantId !== tenantId) return errorResponse('Forbidden: Access denied to this tenant', 403);
  return handleCreatePaymentIntent(c.req.raw, c.env, tenantId);
});

app.post('/api/payments/confirm', async (c) => {
  const tenantId = await getTenant(c.req.raw, c.env);
  if (!tenantId) return errorResponse('Tenant not found', 404);
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse('Missing or invalid Authorization header', 401);
  }
  const token = authHeader.split(' ')[1];
  const decoded = await verifyJWT(token, c.env.JWT_SECRET);
  if (!decoded) return errorResponse('Session expired or invalid signature', 401);
  if (decoded.posType === 'pos') return errorResponse('Forbidden: POS sessions cannot access payment routes', 403);
  if (decoded.role !== 'super_admin' && decoded.tenantId !== tenantId) return errorResponse('Forbidden: Access denied to this tenant', 403);
  return handleConfirmPayment(c.req.raw, c.env, tenantId);
});

// S-C2 fix: Webhook is already rate-limited by the /api/payments/* middleware above.
// Stripe requires reliable delivery, so do NOT apply a second (stricter) rate limiter here.
app.post('/api/payments/webhook', async (c) => {
  return handleStripeWebhook(c.req.raw, c.env);
});

// ── POS routes (self-contained auth, before catch-all) ─────
app.use('/api/pos/auth/login', rateLimitMiddleware({ windowMs: 60000, max: 15 }));
app.use('/api/pos/*', rateLimitMiddleware({ windowMs: 60000, max: 60 }));
app.route('/api/pos', posRoutes);

// ── Contact form route (public, rate-limited) ──────────────
app.post('/api/contact', rateLimitMiddleware({ windowMs: 60000, max: 10 }), async (c) => {
  const tenantId = await getTenant(c.req.raw, c.env);
  return handleLeadsRoute(c.req.raw, c.env, tenantId);
});

// ── Leads route (public, rate-limited) ─────────────────────
app.post('/api/leads', rateLimitMiddleware({ windowMs: 60000, max: 10 }), async (c) => {
  const tenantId = await getTenant(c.req.raw, c.env);
  return handleLeadsRoute(c.req.raw, c.env, tenantId);
});

// ── Meal Schedules routes (auth + tenant scoping) ─────────
app.all('/api/meal-schedules', async (c) => {
  const tenantId = await getTenant(c.req.raw, c.env);
  if (!tenantId) return errorResponse('Tenant not found', 404);
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse('Missing or invalid Authorization header', 401);
  }
  const token = authHeader.split(' ')[1];
  const decoded = await verifyJWT(token, c.env.JWT_SECRET);
  if (!decoded) return errorResponse('Session expired or invalid signature', 401);
  if (decoded.posType === 'pos') {
    return errorResponse('Forbidden: POS sessions are not allowed to access admin routes', 403);
  }
  if (decoded.role !== 'super_admin' && decoded.tenantId !== tenantId) {
    return errorResponse('Forbidden: Access denied to this tenant partition', 403);
  }
  return handleMealSchedulesRoute(c.req.raw, c.env, tenantId);
});
app.all('/api/meal-schedules/*', async (c) => {
  const tenantId = await getTenant(c.req.raw, c.env);
  if (!tenantId) return errorResponse('Tenant not found', 404);
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse('Missing or invalid Authorization header', 401);
  }
  const token = authHeader.split(' ')[1];
  const decoded = await verifyJWT(token, c.env.JWT_SECRET);
  if (!decoded) return errorResponse('Session expired or invalid signature', 401);
  if (decoded.posType === 'pos') {
    return errorResponse('Forbidden: POS sessions are not allowed to access admin routes', 403);
  }
  if (decoded.role !== 'super_admin' && decoded.tenantId !== tenantId) {
    return errorResponse('Forbidden: Access denied to this tenant partition', 403);
  }
  return handleMealSchedulesRoute(c.req.raw, c.env, tenantId);
});

// ── POS Users routes (tenant-admin + super-admin staff management) ──
app.all('/api/pos-users', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse('Missing or invalid Authorization header', 401);
  }
  const token = authHeader.split(' ')[1];
  const decoded = await verifyJWT(token, c.env.JWT_SECRET);
  if (!decoded) return errorResponse('Session expired or invalid signature', 401);
  if (decoded.posType === 'pos') return errorResponse('Forbidden: POS sessions are not allowed to access admin routes', 403);
  if (decoded.role !== 'super_admin' && decoded.role !== 'admin') return errorResponse('Forbidden: Insufficient permissions', 403);
  const tenantId = await getTenant(c.req.raw, c.env);
  if (decoded.role !== 'super_admin' && !tenantId) return errorResponse('Tenant not found', 404);
  return handlePosUsersRoute(c.req.raw, c.env, tenantId);
});
app.all('/api/pos-users/*', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse('Missing or invalid Authorization header', 401);
  }
  const token = authHeader.split(' ')[1];
  const decoded = await verifyJWT(token, c.env.JWT_SECRET);
  if (!decoded) return errorResponse('Session expired or invalid signature', 401);
  if (decoded.posType === 'pos') return errorResponse('Forbidden: POS sessions are not allowed to access admin routes', 403);
  if (decoded.role !== 'super_admin' && decoded.role !== 'admin') return errorResponse('Forbidden: Insufficient permissions', 403);
  const tenantId = await getTenant(c.req.raw, c.env);
  if (decoded.role !== 'super_admin' && !tenantId) return errorResponse('Tenant not found', 404);
  return handlePosUsersRoute(c.req.raw, c.env, tenantId);
});

// ── SSE live stream (per-tenant Durable Object broadcast hub) ────────
// GET /api/stream/orders?tenantId=<id>[&token=<jwt>] streams `new-booking`
// events to a tenant-admin dashboard. Registered BEFORE the auth catch-all
// so the long-lived SSE Response passes through untouched. CORS is applied
// by the global hono/cors middleware above — this route (and the Broadcaster
// DO) never set Access-Control-* headers themselves.
//
// Auth: the JWT is accepted from the `Authorization: Bearer <jwt>` header
// (regular admin API clients) OR from the `token` query parameter when the
// header is absent — EventSource cannot set custom headers, so the frontend
// sends `?token=<jwt>`. Header wins when both are present; 401 when neither.
app.get('/api/stream/orders', async (c) => {
  const env = c.env;
  const tenantId = c.req.query('tenantId');
  if (!tenantId) {
    return errorResponse('tenantId query parameter is required', 400);
  }

  const authHeader = c.req.header('Authorization');
  const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const queryToken = c.req.query('token');
  const token = headerToken || queryToken;
  if (!token) {
    return errorResponse('Missing or invalid Authorization header or token query parameter', 401);
  }
  const decoded = await verifyJWT(token, env.JWT_SECRET);
  if (!decoded) return errorResponse('Session expired or invalid signature', 401);
  if (decoded.posType === 'pos') {
    return errorResponse('Forbidden: POS sessions are not allowed to access admin routes', 403);
  }
  if (decoded.role !== 'admin' && decoded.role !== 'super_admin') {
    return errorResponse('Forbidden: admin role required', 403);
  }
  if (decoded.role !== 'super_admin' && decoded.tenantId && decoded.tenantId !== tenantId) {
    return errorResponse('Forbidden: Access denied to this tenant', 403);
  }

  if (!env.BROADCASTER) {
    return errorResponse('SSE broadcaster is not configured', 503);
  }

  const id = env.BROADCASTER.idFromName(tenantId);
  const stub = env.BROADCASTER.get(id);
  return stub.fetch(new Request('http://broadcaster/connect?tenantId=' + encodeURIComponent(tenantId), {
    method: 'GET',
    headers: c.req.raw.headers,
  }));
});

// ── OpenAPI spec (T8: served from the registry — static path wins over the
// catch-all below; deliberately NOT wrapped in jsonResponse so $ref/anyOf keys
// pass through untouched) ──────────────────────────────────────────────────────
app.get('/api/openapi.json', (c) => c.json(buildOpenApiDocument()));

// ── Main API catch-all (auth + tenant scoping) ────────────
// Note: /api/me = tenant data (public). /api/auth/me = admin user data (JWT required).
// P0-7: Rate limit general catch-all to protect public marketplace endpoints from abuse.
app.all('/api/*', rateLimitMiddleware({ windowMs: 60000, max: 100 }), async (c) => {
  const path = c.req.path;
  const method = c.req.method;
  const env = c.env;

  const publicPaths = [
    { path: '/api/me', method: 'GET' },
  ];
  const isPublic = publicPaths.some(p => p.path === path && p.method === method)
    || (path.startsWith('/api/availability') && method === 'GET')
    || (path.startsWith('/api/camps') && method === 'GET')
    || (path.startsWith('/api/products') && method === 'GET')
    || (path.startsWith('/api/rooms') && method === 'GET')
    || (path.startsWith('/api/rateplans') && method === 'GET')
    || (path.startsWith('/api/meals') && method === 'GET')
    || (path.startsWith('/api/categories') && method === 'GET')
    || (path.startsWith('/api/meal-categories') && method === 'GET')
    || (path === '/api/orders' && method === 'POST')
    || (path.match(/^\/api\/orders\/status\/.+$/) && method === 'GET')
    || (path === '/api/orders/calculate-price' && method === 'GET')
    || (path === '/api/leads' && method === 'POST')
    || (path === '/api/contact' && method === 'POST')
    || (path.startsWith('/api/media') && method === 'GET'); // public media stream (key embeds tenantId)

  const tenantId = await getTenant(c.req.raw, env);

  if (!isPublic) {
    if (!tenantId) return errorResponse('Unauthorized: missing tenant context', 401);

    if (path.startsWith('/api/')) {
      const authHeader = c.req.header('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return errorResponse('Missing or invalid Authorization header', 401);
      }
      const token = authHeader.split(' ')[1];
      const decoded = await verifyJWT(token, env.JWT_SECRET);
      if (!decoded) return errorResponse('Session expired or invalid signature', 401);
      // P0-6: Verify user is still active (inline JWT calls don't use authMiddleware)
      const { results: activeCheck } = await env.DB.prepare('SELECT is_active FROM admins WHERE id = ?').bind(decoded.userId || decoded.sub).all();
      if (!activeCheck.length || activeCheck[0].is_active === 0) {
        return errorResponse('Account deactivated', 401);
      }
      if (decoded.posType === 'pos') {
        return errorResponse('Forbidden: POS sessions are not allowed to access admin routes', 403);
      }
      if (decoded.role !== 'super_admin' && decoded.tenantId !== tenantId) {
        return errorResponse('Forbidden: Access denied to this tenant partition', 403);
      }
      c.set('user', decoded);
    }
  }

  try {
    if (path === '/api/me') return handleMe(c.req.raw, env, tenantId);
    if (path.startsWith('/api/reports')) return await handleReportsRoute(c.req.raw, env, tenantId);
    if (path.startsWith('/api/inventory')) return await handleInventoryRoute(c.req.raw, env, tenantId);
    if (path.startsWith('/api/camps')) return await handleCampsRoute(c.req.raw, env, tenantId);
    if (path.startsWith('/api/products')) return await handleProductsRoute(c.req.raw, env, tenantId);
    if (path.startsWith('/api/rooms')) return await handleRoomsRoute(c.req.raw, env, tenantId);
    if (path.startsWith('/api/rateplans')) return await handleRatePlansRoute(c.req.raw, env, tenantId);
    if (path.startsWith('/api/price-overrides')) return await handlePriceOverridesRoute(c.req.raw, env, tenantId);
    if (path.startsWith('/api/orders')) return await handleOrdersRoute(c.req.raw, env, tenantId);
    if (path.startsWith('/api/availability')) return await handleAvailability(c.req.raw, env, tenantId);
    if (path.startsWith('/api/meals')) return await handleMealsRoute(c.req.raw, env, tenantId);
    if (path.startsWith('/api/meal-categories')) return await handleMealCategoriesRoute(c.req.raw, env, tenantId);
    if (path.startsWith('/api/categories')) return await handleCategoriesRoute(c.req.raw, env, tenantId);
    if (path.startsWith('/api/plans')) return await handlePlansRoute(c.req.raw, env, tenantId);
    if (path.startsWith('/api/leads') || path.startsWith('/api/contact')) return await handleLeadsRoute(c.req.raw, env, tenantId);
    // Unified inbox (Phase 4): auth + tenant scoped like leads/admin — NOT public.
    if (path.startsWith('/api/inbox')) return await handleInboxRoute(c.req.raw, env, tenantId);
    // POST /api/upload runs through the auth gate above (tenant-admin only);
    // GET /api/media/* is public and streams from R2.
    if (path === '/api/upload') return await handleUploadRoute(c.req.raw, env, tenantId);
    if (path.startsWith('/api/media')) return await handleMediaRoute(c.req.raw, env);

    return errorResponse('API endpoint not found', 404);
  } catch (e) {
    // S-M4 fix: Never leak raw error messages in production
    if (env.ENVIRONMENT === 'production') {
      console.error('[ROUTE ERROR]', e.message);
    }
    return errorResponse(env.ENVIRONMENT === 'production' ? 'Internal Server Error' : e.message, 500);
  }
});

app.onError((err, c) => {
  if (c.env?.ENVIRONMENT !== 'production') {
    console.error('[UNHANDLED ERROR]', err.stack || err.message);
  }
  return errorResponse('Internal Server Error', 500);
});

app.notFound((c) => errorResponse('Not found', 404));

export default {
  async fetch(request, env) {
    return app.fetch(request, env);
  },
};
