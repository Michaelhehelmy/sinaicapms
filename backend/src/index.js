import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { getTenant } from './middleware/tenant';
import { policyLimiter } from './middleware/rateLimit';
import { requireAuth } from './middleware/requireAuth.js';
import { handleAuthRoute } from './api/auth';
import { handleTenants } from './api/tenants';
import meRoutes from './api/tenants';
import { handleAdminRoute } from './api/admin';
import campsRoutes, { productsRoutes, roomsRoutes, ratePlansRoutes } from './api/camps';
import ordersRoutes, { availabilityRoutes } from './api/orders';
import uploadRoutes, { mediaRoutes } from './api/upload';
import { handleMealSchedulesRoute } from './api/meal-schedules';
import { handlePosUsersRoute } from './api/pos-users';
import { jsonResponse, errorResponse } from './utils/response';
import { handleCreatePaymentIntent, handleConfirmPayment, handleStripeWebhook } from './api/payments';
import reportsRoutes from './api/reports';
import inventoryRoutes from './api/inventory';
import priceOverridesRoutes from './api/priceOverrides';
import plansRoutes from './api/others';
import mealCategoriesRoutes from './api/meal-categories';
import categoriesRoutes from './api/categories';
import mealsRoutes from './api/meals';
import promotionsRoutes from './api/promotions';
import onboardingRoutes from './api/onboarding';
import { resolveScope } from './middleware/resolveScope.js';
import leadsRoutes, { createLead } from './api/leads';
import inboxRoutes from './api/inbox';
import { tenantMetaRoutes, projectMetaRoutes } from './api/meta';
import tagsRoutes, { projectTagsRoutes } from './api/tags';
import auditRoutes from './api/audit';
import posTablesRoutes from './api/pos-tables';
import servicesRoutes from './api/services';
import { buildOpenApiDocument } from './routes/registry';
import posRoutes, { handlePosLoginRequest } from './routes/pos/index.js';
import { withSunset } from './utils/deprecation.js';
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

// ── Global declarative rate limiting (Phase 4 T2) ──────────
// One ordered policy table (RATE_LIMIT_POLICIES) replaces every previously
// scattered explicit rateLimitMiddleware mount. First matching entry wins;
// SSE streams are exempted inside policyLimiter.
app.use('/api/*', policyLimiter());

app.get('/', (c) => c.html(`<!DOCTYPE html>
<html><head><title>SinaiCamps API</title></head>
<body style="font-family: sans-serif; text-align: center; padding: 50px; background: #f8f9fa;">
  <h1>SinaiCamps API</h1>
  <p>Serverless API worker is running.</p>
</body></html>`));

// ── Auth routes (rate-limited by policy table: /api/auth/* 30/min) ────────
// Phase 9: consolidated POS login — canonical path, shared handler with the
// legacy POST /api/pos/auth/login (which keeps a stricter 15/min policy and
// Sunset headers). Registered BEFORE the auth catch-all.
app.post('/api/auth/pos-login', (c) => handlePosLoginRequest(c.req.raw, c.env));

app.all('/api/auth/*', async (c) => {
  return handleAuthRoute(c.req.raw, c.env);
});

// ── Tenant meta (unified architecture) ────────────────────
// MUST stay registered BEFORE app.get('/api/tenants/*', handleTenantsRoute)
// below: Hono runs matching handlers in registration order, so the tenant
// wildcard would otherwise swallow every /api/tenants/:tenantId/meta request
// before the sub-router is reached. GET is public-read; mutations are
// admin-scoped (meta.js self-enforces per-key visibility via getScope(c)).
// A single '/meta/*' use-line covers both the exact path and subpaths
// (/reorder, /:id, /:key) with exactly one middleware run — registering a
// second bare '/meta' use-line would double-run resolveScope on exact-path
// requests (verified against hono routing on this version).
const metaPublicScope = resolveScope({ public: true });
const metaAdminScope = resolveScope();
const metaScope = async (c, next) =>
  c.req.method === 'GET' ? metaPublicScope(c, next) : metaAdminScope(c, next);
app.use('/api/tenants/:tenantId/meta/*', metaScope);
app.route('/api/tenants/:tenantId/meta', tenantMetaRoutes);

// ── Tenant routes (S-C1 fix: only explicit GET + POST, no app.all shadow) ──
const handleTenantsRoute = async (c) => handleTenants(c.req.raw, c.env);
app.post('/api/tenants', handleTenantsRoute);
app.get('/api/tenants', handleTenantsRoute);
app.get('/api/tenants/*', handleTenantsRoute);

// ── Admin routes (rate-limited by policy table; super-admin only) ─────────
const handleSuperAdminRoute = async (c) => handleAdminRoute(c.req.raw, c.env);
app.all('/api/admin', handleSuperAdminRoute);
app.all('/api/admin/*', handleSuperAdminRoute);

// ── Payment routes (rate-limited by policy table: /api/payments* 20/min) ──

const paymentGate = requireAuth({
  realm: 'admin',
  realmMismatch: { message: 'Forbidden: POS sessions cannot access payment routes' },
  scopeDenied: { message: 'Forbidden: Access denied to this tenant' },
});

app.post('/api/payments/create-intent', async (c) => {
  const tenantId = await getTenant(c.req.raw, c.env);
  if (!tenantId) return errorResponse('Tenant not found', 404);
  const auth = await paymentGate(c.req.raw, c.env, { tenantId });
  if (auth instanceof Response) return auth;
  return handleCreatePaymentIntent(c.req.raw, c.env, tenantId);
});

app.post('/api/payments/confirm', async (c) => {
  const tenantId = await getTenant(c.req.raw, c.env);
  if (!tenantId) return errorResponse('Tenant not found', 404);
  const auth = await paymentGate(c.req.raw, c.env, { tenantId });
  if (auth instanceof Response) return auth;
  return handleConfirmPayment(c.req.raw, c.env, tenantId);
});

// S-C2 fix: Webhook is covered by the /api/payments* entry in the policy table.
// Stripe requires reliable delivery, so do NOT apply a stricter limiter here.
app.post('/api/payments/webhook', async (c) => {
  return handleStripeWebhook(c.req.raw, c.env);
});

// ── POS routes (self-contained auth, before catch-all;
//    login + general POS limits live in the policy table) ────
app.route('/api/pos', posRoutes);

// ── Contact form (public; POST /api/contact 10/min via policy table).
// Phase 9: DEPRECATED alias of POST /api/leads (source defaults to 'contact').
// Kept during the transition window with Deprecation + Sunset headers. ────
const contactPublicScope = resolveScope({ public: true });
app.post('/api/contact', contactPublicScope, (c) => createLead(c).then(withSunset));

// ── Meal Schedules routes (auth + tenant scoping) ─────────
const mealSchedulesGate = requireAuth({ realm: 'admin' });

app.all('/api/meal-schedules', async (c) => {
  const tenantId = await getTenant(c.req.raw, c.env);
  if (!tenantId) return errorResponse('Tenant not found', 404);
  const auth = await mealSchedulesGate(c.req.raw, c.env, { tenantId });
  if (auth instanceof Response) return auth;
  return handleMealSchedulesRoute(c.req.raw, c.env, tenantId);
});
app.all('/api/meal-schedules/*', async (c) => {
  const tenantId = await getTenant(c.req.raw, c.env);
  if (!tenantId) return errorResponse('Tenant not found', 404);
  const auth = await mealSchedulesGate(c.req.raw, c.env, { tenantId });
  if (auth instanceof Response) return auth;
  return handleMealSchedulesRoute(c.req.raw, c.env, tenantId);
});

// ── POS Users routes (tenant-admin + super-admin staff management) ──
// requireTenant:false — the outer gate runs BEFORE getTenant() resolves the
// tenant, so an 'equals' scope check here would compare the claim against
// undefined and 403 every tenant admin (regression vs the pre-requireAuth
// inline gate). Partition scoping is enforced inside handlePosUsersRoute,
// where scopeTenant hard-scopes admins to their own decoded.tenantId.
const posUsersGate = requireAuth({ realm: 'admin', roles: ['super_admin', 'admin'], requireTenant: false });

app.all('/api/pos-users', async (c) => {
  const auth = await posUsersGate(c.req.raw, c.env);
  if (auth instanceof Response) return auth;
  const tenantId = await getTenant(c.req.raw, c.env);
  if (auth.user.role !== 'super_admin' && !tenantId) return errorResponse('Tenant not found', 404);
  return handlePosUsersRoute(c.req.raw, c.env, tenantId);
});
app.all('/api/pos-users/*', async (c) => {
  const auth = await posUsersGate(c.req.raw, c.env);
  if (auth instanceof Response) return auth;
  const tenantId = await getTenant(c.req.raw, c.env);
  if (auth.user.role !== 'super_admin' && !tenantId) return errorResponse('Tenant not found', 404);
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
const sseOrdersGate = requireAuth({
  realm: 'admin',
  allowQueryToken: true,
  missingToken: { message: 'Missing or invalid Authorization header or token query parameter' },
  roles: ['admin', 'super_admin'],
  insufficientRole: { message: 'Forbidden: admin role required' },
  scopeMode: 'lenient',
  scopeDenied: { message: 'Forbidden: Access denied to this tenant' },
});

app.get('/api/stream/orders', async (c) => {
  const env = c.env;
  const tenantId = c.req.query('tenantId');
  if (!tenantId) {
    return errorResponse('tenantId query parameter is required', 400);
  }

  const auth = await sseOrdersGate(c.req.raw, env, { tenantId });
  if (auth instanceof Response) return auth;

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

// ── Reports (Phase 4 T1: first catch-all branch converted to a sub-router).
// Auth + tenant scoping via resolveScope (admin realm); the router itself
// enforces GET-only and the legacy fallthrough messages.
const reportsScope = resolveScope();
app.use('/api/reports', reportsScope);
app.use('/api/reports/*', reportsScope);
app.route('/api/reports', reportsRoutes);

// ── Inventory (Phase 4 T1) — admin-scoped low-stock reporting.
const inventoryScope = resolveScope();
app.use('/api/inventory', inventoryScope);
app.use('/api/inventory/*', inventoryScope);
app.route('/api/inventory', inventoryRoutes);

// ── Price overrides (Phase 4 T1) — tenant-scoped CRUD (GET list / PUT bulk
// upsert / DELETE single). Admin realm, same as the legacy catch-all gate.
const priceOverridesScope = resolveScope();
app.use('/api/price-overrides', priceOverridesScope);
app.use('/api/price-overrides/*', priceOverridesScope);
app.route('/api/price-overrides', priceOverridesRoutes);

// ── Plans (Phase 4 T1) — tenant-scoped via camp ownership.
const plansScope = resolveScope();
app.use('/api/plans', plansScope);
app.use('/api/plans/*', plansScope);
app.route('/api/plans', plansRoutes);

// ── Meal categories (Phase 4 T1). Mixed visibility, matching the legacy
// catch-all publicPaths entry: GET is public (menu browsing — best-effort
// tenant resolution), mutations require admin auth + tenant context.
const mealCategoriesPublicScope = resolveScope({ public: true });
const mealCategoriesAdminScope = resolveScope();
const mealCategoriesScope = async (c, next) =>
  c.req.method === 'GET'
    ? mealCategoriesPublicScope(c, next)
    : mealCategoriesAdminScope(c, next);
app.use('/api/meal-categories', mealCategoriesScope);
app.use('/api/meal-categories/*', mealCategoriesScope);
app.route('/api/meal-categories', mealCategoriesRoutes);

// ── Categories (Phase 4 T1). Same mixed visibility: GET public
// (header-cached), mutations admin.
const categoriesPublicScope = resolveScope({ public: true });
const categoriesAdminScope = resolveScope();
const categoriesScope = async (c, next) =>
  c.req.method === 'GET'
    ? categoriesPublicScope(c, next)
    : categoriesAdminScope(c, next);
app.use('/api/categories', categoriesScope);
app.use('/api/categories/*', categoriesScope);
app.route('/api/categories', categoriesRoutes);

// ── Meals (Phase 4 T1). Same mixed visibility: GET public (menu browsing),
// mutations admin.
const mealsPublicScope = resolveScope({ public: true });
const mealsAdminScope = resolveScope();
const mealsScope = async (c, next) =>
  c.req.method === 'GET'
    ? mealsPublicScope(c, next)
    : mealsAdminScope(c, next);
app.use('/api/meals', mealsScope);
app.use('/api/meals/*', mealsScope);
app.route('/api/meals', mealsRoutes);

// ── Promotions (discount engine). Mixed visibility by path+method: GET is
// public (active-only for visitors; ?includeInactive=1 honored when authed)
// and POST /api/promotions/apply ALSO rides the public scope so POS carts
// (pos-realm tokens — rejected outright by the admin realm gate) and
// anonymous checkout widgets can price a cart without an admin session;
// apply is pure computation and never mutates rows. All remaining mutations
// (POST create, PUT /:id, DELETE /:id) stay admin-scoped.
const promotionsPublicScope = resolveScope({ public: true });
const promotionsAdminScope = resolveScope();
const isPromotionsPublic = (c) =>
  c.req.method === 'GET' ||
  (c.req.method === 'POST' && c.req.path === '/api/promotions/apply');
const promotionsScope = async (c, next) =>
  isPromotionsPublic(c) ? promotionsPublicScope(c, next) : promotionsAdminScope(c, next);
app.use('/api/promotions', promotionsScope);
app.use('/api/promotions/*', promotionsScope);
app.route('/api/promotions', promotionsRoutes);

// ── Dynamic Service Module. GET /public/:slug is public; everything else is admin-scoped.
const servicesPublicScope = resolveScope({ public: true });
const servicesAdminScope = resolveScope();
const isServicesPublic = (c) =>
  c.req.method === 'GET' && c.req.path.startsWith('/api/services/public/');
const servicesScope = async (c, next) =>
  isServicesPublic(c) ? servicesPublicScope(c, next) : servicesAdminScope(c, next);
app.use('/api/services', servicesScope);
app.use('/api/services/*', servicesScope);
app.route('/api/services', servicesRoutes);

// ── Self-service onboarding. All endpoints are public (no auth required).
const onboardingPublicScope = resolveScope({ public: true });
app.use('/api/public', onboardingPublicScope);
app.use('/api/public/*', onboardingPublicScope);
app.use('/api/onboarding', onboardingPublicScope);
app.use('/api/onboarding/*', onboardingPublicScope);
app.route('/api', onboardingRoutes);

// ── Unified inbox (Phase 4): auth + tenant scoped like leads/admin — NOT public.
const inboxAdminScope = resolveScope();
app.use('/api/inbox', inboxAdminScope);
app.use('/api/inbox/*', inboxAdminScope);
app.route('/api/inbox', inboxRoutes);

// ── Leads (Phase 4 T1). POST is public (contact/reservation forms; 10/min
// via policy table), GET/PUT/DELETE are admin-scoped.
const leadsPublicScope = resolveScope({ public: true });
const leadsAdminScope = resolveScope();
const leadsScope = async (c, next) =>
  c.req.method === 'POST'
    ? leadsPublicScope(c, next)
    : leadsAdminScope(c, next);
app.use('/api/leads', leadsScope);
app.use('/api/leads/*', leadsScope);
app.route('/api/leads', leadsRoutes);

// ── /api/me (Phase 4 T1). Mixed visibility: GET is public (R-9 — graceful
// 200 without tenant context), PUT/PATCH are tenant-admin only.
const mePublicScope = resolveScope({ public: true });
const meAdminScope = resolveScope();
const meScope = async (c, next) =>
  c.req.method === 'GET'
    ? mePublicScope(c, next)
    : meAdminScope(c, next);
app.use('/api/me', meScope);
app.route('/api/me', meRoutes);

// ── Catalog routers (Phase 4 T1): camps / products / rooms / rateplans.
// Mixed visibility: GET is public (marketplace browsing, price preview),
// mutations are admin-scoped. Camps GET also serves the cross-tenant
// marketplace listing when the host has no tenant context.
const catalogPublicScope = resolveScope({ public: true });
const catalogAdminScope = resolveScope();
const catalogScope = async (c, next) =>
  c.req.method === 'GET'
    ? catalogPublicScope(c, next)
    : catalogAdminScope(c, next);
app.use('/api/camps', catalogScope);
app.use('/api/camps/*', catalogScope);
app.route('/api/camps', campsRoutes);

const productsPublicScope = resolveScope({ public: true });
const productsAdminScope = resolveScope();
const productsScope = async (c, next) =>
  c.req.method === 'GET'
    ? productsPublicScope(c, next)
    : productsAdminScope(c, next);
app.use('/api/products', productsScope);
app.use('/api/products/*', productsScope);
app.route('/api/products', productsRoutes);

const roomsPublicScope = resolveScope({ public: true });
const roomsAdminScope = resolveScope();
const roomsScope = async (c, next) =>
  c.req.method === 'GET'
    ? roomsPublicScope(c, next)
    : roomsAdminScope(c, next);
app.use('/api/rooms', roomsScope);
app.use('/api/rooms/*', roomsScope);
app.route('/api/rooms', roomsRoutes);

const ratePlansPublicScope = resolveScope({ public: true });
const ratePlansAdminScope = resolveScope();
const ratePlansScope = async (c, next) =>
  c.req.method === 'GET'
    ? ratePlansPublicScope(c, next)
    : ratePlansAdminScope(c, next);
app.use('/api/rateplans', ratePlansScope);
app.use('/api/rateplans/*', ratePlansScope);
app.route('/api/rateplans', ratePlansRoutes);

// ── Orders. Mixed visibility by path+method: public are GET /api/orders/status/:ref
// and GET /api/orders/calculate-price (price preview widget); kitchen-status PATCH
// accepts both admin and POS tokens (POS terminals advance kitchen workflow);
// everything else is admin-scoped (C1 fix).
const ordersPublicScope = resolveScope({ public: true });
const ordersAdminScope = resolveScope();
const ordersDualScope = resolveScope({ dualRealm: true });
const isOrdersPublic = (c) =>
  c.req.method === 'GET' &&
    (c.req.path.startsWith('/api/orders/status/') ||
      c.req.path === '/api/orders/calculate-price');
const isOrdersKitchenStatus = (c) =>
  c.req.method === 'PATCH' && c.req.path.match(/\/api\/orders\/[^/]+\/kitchen-status/);
const ordersScope = async (c, next) => {
  if (isOrdersPublic(c)) return ordersPublicScope(c, next);
  if (isOrdersKitchenStatus(c)) return ordersDualScope(c, next);
  return ordersAdminScope(c, next);
};
app.use('/api/orders', ordersScope);
app.use('/api/orders/*', ordersScope);
app.route('/api/orders', ordersRoutes);

// ── Availability (Phase 4 T1). Fully public read-only (60s header cache).
const availabilityPublicScope = resolveScope({ public: true });
app.use('/api/availability', availabilityPublicScope);
app.route('/api/availability', availabilityRoutes);

// ── Upload + media (Phase 4 T1). POST /api/upload is tenant-admin only
// (resolveScope admin realm); GET/HEAD /api/media/* is fully public and
// streams from R2 (the key embeds the tenantId, so no auth is needed).
const uploadAdminScope = resolveScope();
app.use('/api/upload', uploadAdminScope);
app.route('/api/upload', uploadRoutes);

const mediaPublicScope = resolveScope({ public: true });
app.use('/api/media', mediaPublicScope);
app.use('/api/media/*', mediaPublicScope);
app.route('/api/media', mediaRoutes);

// ── Project meta, tags, audit log (unified architecture) ──
// Project meta reuses metaScope: GET public-read, mutations admin-scoped,
// per-key visibility self-enforced in api/meta.js. Project tag links ride
// the catalog visibility model (public read, admin attach/detach); global
// /api/tags is the same model for the tenant-wide tag dictionary. Audit log
// has no public surface — super_admin/admin listing only. Single star
// use-lines throughout (one middleware run; see note at the meta mount).
app.use('/api/projects/:projectId/meta/*', metaScope);
app.route('/api/projects/:projectId/meta', projectMetaRoutes);

const tagsPublicScope = resolveScope({ public: true });
const tagsAdminScope = resolveScope();
const tagsScope = async (c, next) =>
  c.req.method === 'GET' ? tagsPublicScope(c, next) : tagsAdminScope(c, next);
app.use('/api/tags/*', tagsScope);
app.route('/api/tags', tagsRoutes);

app.use('/api/projects/:projectId/tags/*', catalogScope);
app.route('/api/projects/:projectId/tags', projectTagsRoutes);

const auditAdminScope = resolveScope();
app.use('/api/audit/*', auditAdminScope);
app.route('/api/audit', auditRoutes);

// ── Restaurant pillar: POS floor tables (0069). Dual-realm scope: admin AND
// POS tokens are accepted (POS terminals need to read table status for seat
// operations). Mutations are still gated to admin role inside the router. ────
const posTablesDualScope = resolveScope({ dualRealm: true });
app.use('/api/pos-tables', posTablesDualScope);
app.use('/api/pos-tables/*', posTablesDualScope);
app.route('/api/pos-tables', posTablesRoutes);

// ── Meal plans (0070): public read for project meal plan options ──────────
// Registered as a direct endpoint (not app.route) to avoid the sub-router's
// catch-all interfering with existing /api/projects/:projectId/* routes.
const mealPlansPublicScope = resolveScope({ public: true });
app.use('/api/projects/:id/meal-plans', mealPlansPublicScope);
app.get('/api/projects/:id/meal-plans', async (c) => {
  try {
    const projectId = c.req.param('id');

    const project = await c.env.DB.prepare(
      'SELECT tenant_id, meal_plan_category_id FROM projects WHERE id = ? AND deleted_at IS NULL'
    ).bind(projectId).first();

    if (!project || !project.meal_plan_category_id) {
      return jsonResponse({ meal_plans: [] });
    }

    const { results: orgMapping } = await c.env.DB.prepare(
      'SELECT organization_id FROM tenant_org_mapping WHERE tenant_id = ?'
    ).bind(project.tenant_id).all();

    if (orgMapping.length === 0) {
      return jsonResponse({ meal_plans: [] });
    }

    const organizationId = orgMapping[0].organization_id;

    const { results: products } = await c.env.DB.prepare(
      `SELECT id, name, selling_price, description, image_url
       FROM pos_products
       WHERE category_id = ? AND organization_id = ? AND is_active = 1`
    ).bind(project.meal_plan_category_id, organizationId).all();

    return jsonResponse({ meal_plans: products });
  } catch (e) {
    return errorResponse('Failed to fetch meal plans');
  }
});

// ── API terminal fallback ─────────────────────────────────
// Phase 4 complete: every Paradigm-B dispatcher module above this line has
// been converted to a Hono sub-router with its own resolveScope mount. What
// remains for unmatched /api/* paths is a plain 404 — unknown prefixes no
// longer leak their existence via 401-before-404, and rate-limit protection
// is provided by the global policyLimiter above.
app.all('/api/*', () => errorResponse('API endpoint not found', 404));

app.onError((err, c) => {
  if (c.env?.ENVIRONMENT !== 'production') {
    console.error('[UNHANDLED ERROR]', err.stack || err.message);
  }
  return errorResponse('Internal Server Error', 500);
});

app.notFound((c) => errorResponse('Not found', 404));

// ── Phase 9: versioned cutover (/api/v1/*) ────────────────────────────────
// Every /api route is also served under the versioned /api/v1 prefix by
// rewriting the path at the entrypoint BEFORE Hono dispatch — one mount,
// two surfaces, zero duplicated registrations. The unversioned /api/*
// alias stays fully functional during the transition window and is marked
// deprecated (Deprecation + Sunset) so clients can detect and migrate.
const VERSION_PREFIX = '/api/v1';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let versioned = false;
    if (url.pathname === VERSION_PREFIX || url.pathname.startsWith(`${VERSION_PREFIX}/`)) {
      versioned = true;
      const rewritten = new URL(
        `/api${url.pathname.slice(VERSION_PREFIX.length)}${url.search}`,
        url,
      );
      request = new Request(rewritten, request);
    }
    const res = await app.fetch(request, env, ctx);
    // Surface-level deprecation: only the unversioned alias carries Sunset.
    // Versioned requests (and non-API paths) stay clean. Endpoint-level
    // Sunsets (/contact, POS login) are stamped inside their handlers and
    // therefore survive the rewrite on both surfaces.
    if (!versioned && (url.pathname === '/api' || url.pathname.startsWith('/api/'))) {
      return withSunset(res);
    }
    return res;
  },
};
