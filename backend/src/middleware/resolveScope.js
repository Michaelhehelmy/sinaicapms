/**
 * resolveScope — Phase 4 (T3): single source of truth for tenant scope
 * resolution on Hono sub-routers.
 *
 * Replaces the ad-hoc getTenant + requireAuth + scope-setting preamble that
 * every catch-all branch in index.js used to repeat.
 *
 * Two modes:
 *  - { public: true }        → best-effort tenant resolution, never auths.
 *                              Sets scope = { tenantId | null, user: null }.
 *  - default (admin realm)   → resolves the tenant hint first; a protected
 *                              route without a hint fails fast with the
 *                              legacy 401 message; then runs requireAuth
 *                              (realm 'admin') with the hint for token-scope
 *                              enforcement, and stores the effective scope.
 *
 * Effective tenantId:
 *  - super_admin may override the request hint via ?tenantId= query param
 *    (cross-tenant administration).
 *  - admin/manager are hard-scoped by requireAuth ('equals' check) to their
 *    own tenant — a mismatched claim yields requireAuth's 403.
 *  - POS tokens never reach here (realm 'admin' rejects them with 403);
 *    the POS sub-router keeps its own posAuth middleware which trusts
 *    organization_id ↔ tenant_id via tenant_org_mapping.
 */
import { getTenant } from './tenant';
import { requireAuth } from './requireAuth.js';
import { errorResponse } from '../utils/response.js';

/**
 * Auto-provision a POS organization + store + tenant_org_mapping for a tenant
 * that has none. Idempotent (INSERT OR IGNORE on the UNIQUE slug/code) so a
 * partial failure can be safely retried. Returns the organization_id or null.
 *
 * Centralized here (moved verbatim from api/pos-users.js) so admin-side
 * provisioning and any future router share one implementation; api/pos-users.js
 * re-exports it to keep existing import paths working.
 */
export async function ensureTenantOrg(env, tenantId) {
  try {
    const { results: existing } = await env.DB.prepare(
      'SELECT organization_id FROM tenant_org_mapping WHERE tenant_id = ?'
    ).bind(tenantId).all();
    if (existing.length > 0) return existing[0].organization_id;

    const slug = ('org_' + tenantId).replace(/[^a-zA-Z0-9_]/g, '_');

    await env.DB.prepare(
      `INSERT OR IGNORE INTO pos_organizations (name, slug, created_at, updated_at)
       VALUES (?, ?, datetime('now'), datetime('now'))`
    ).bind(tenantId, slug).run();

    const { results: orgRows } = await env.DB.prepare(
      'SELECT id FROM pos_organizations WHERE slug = ?'
    ).bind(slug).all();
    if (!orgRows.length) return null;
    const organizationId = orgRows[0].id;

    await env.DB.prepare(
      `INSERT OR IGNORE INTO pos_stores (organization_id, name, code, address, city, created_at, updated_at)
       VALUES (?, ?, ?, 'N/A', 'N/A', datetime('now'), datetime('now'))`
    ).bind(organizationId, tenantId + ' Store', 'ST_' + tenantId).run();

    await env.DB.prepare(
      `INSERT OR IGNORE INTO tenant_org_mapping (tenant_id, organization_id) VALUES (?, ?)`
    ).bind(tenantId, organizationId).run();

    return organizationId;
  } catch (e) {
    console.error('ensureTenantOrg failed:', e.message);
    return null;
  }
}

/** Read the resolved scope inside a handler: `{ tenantId, user }`. */
export function getScope(c) {
  return c.get('scope') || { tenantId: null, user: null };
}

export function resolveScope(options = {}) {
  const {
    public: isPublicRoute = false,
    auth: authOptions = {},
    requireTenantHint = true,
  } = options;

  // Mount sites register both '/api/x' and '/api/x/*'; Hono matches BOTH
  // patterns for a bare '/api/x' request, so the same middleware instance can
  // run twice per request. Deduplicate per instance (per-request Context key)
  // so the tenant lookup + auth probe fire exactly once.
  const seen = new WeakSet();
  const once = (mw) => async (c, next) => {
    if (seen.has(c)) return next();
    seen.add(c);
    return mw(c, next);
  };

  if (isPublicRoute) {
    return once(async (c, next) => {
      let tenantId = null;
      try {
        tenantId = await getTenant(c.req.raw, c.env);
      } catch {
        // Public routes degrade gracefully to marketplace scope.
        tenantId = null;
      }
      c.set('scope', { tenantId: tenantId || null, user: null });
      await next();
    });
  }

  const gate = requireAuth({ realm: 'admin', ...authOptions });

  return once(async (c, next) => {
    const tenantHint = await getTenant(c.req.raw, c.env);
    if (requireTenantHint && !tenantHint) {
      // Byte-compat with the legacy catch-all guard.
      return errorResponse('Unauthorized: missing tenant context', 401);
    }

    const auth = await gate(c.req.raw, c.env, { tenantId: tenantHint });
    if (auth instanceof Response) return auth;

    const user = auth.user;
    const queryOverride =
      user.role === 'super_admin' ? c.req.query('tenantId') : undefined;
    const tenantId = queryOverride || tenantHint || user.tenantId || null;

    c.set('user', user);
    c.set('scope', { tenantId, user });
    await next();
  });
}
