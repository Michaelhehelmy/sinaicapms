/**
 * requireAuth — the ONE auth gate for all routes.
 *
 * Replaces the ~13 hand-copied inline JWT gates (Phase 1 of
 * UNIFIED_ARCHITECTURE_PLAN.md) BYTE-COMPAT: identical status codes and
 * verbatim error bodies at every former call site ("Account deactivated",
 * "Invalid POS session", "Forbidden: Access denied to this tenant partition",
 * etc. stay exact).
 *
 * Options:
 * - realm: 'admin' | 'pos' (required) — which token realm the route serves.
 * - roles: string[] (optional, e.g. ['super_admin', 'admin']) — exact
 *   membership allow-list. Evaluated AFTER the realm match, so an org (POS)
 *   user can never satisfy an admin-role requirement and vice versa
 *   (domain pairing is enforced structurally by step 2).
 * - requireTenant: boolean (default true) — when true the caller passes
 *   ctx.tenantId and any non-super_admin token whose tenantId claim differs
 *   from it is rejected ('equals' scoping). Pass false for routes that
 *   resolve/validate tenant context themselves after authentication.
 * - allowQueryToken: boolean (for SSE routes that accept ?token=)
 * - checkActive: boolean (default true) — every-request re-validation of
 *   is_active (+ deleted_at IS NULL for org users). Closes the deactivation
 *   gap on routes that previously never re-checked. Only set false when a
 *   wrapping requireAuth gate on the same request already ran the probe.
 *
 * Order of checks:
 * 1. Signature verification
 * 2. Realm match (POS token on admin route → 403)
 * 3. Role membership (domain-paired by step 2)
 * 4. is_active ∧ deleted_at IS NULL (every request — deactivation-gap fix)
 * 5. Tenant scope
 *
 * NOTE: the role check runs BEFORE the DB activity probe so pure
 * authorization rejections still make zero database round-trips (a locked
 * contract in tests/unit suites); the security property is unchanged — no
 * request reaches a handler without passing BOTH the role requirement and
 * the is_active/deleted_at probe.
 */

import { verifyToken } from './sharedAuth.js';
import { errorResponse } from '../utils/response.js';

// Plan §7.3 — single rank source (consumption starts Phase 5; today's gates
// use exact-membership lists to preserve byte-compat).
export const ROLE_RANKS = {
  super_admin: 100,
  admin: 80,
  manager: 50,
  cashier: 30,
};

const DEFAULT_MESSAGES = {
  missingToken: { status: 401, message: 'Missing or invalid Authorization header' },
  invalidToken: { status: 401, message: 'Session expired or invalid signature' },
  realmMismatch: { status: 403, message: 'Forbidden: POS sessions are not allowed to access admin routes' },
  insufficientRole: { status: 403, message: 'Forbidden: Insufficient permissions' },
  deactivated: { status: 401, message: 'Account deactivated' },
  scopeDenied: { status: 403, message: 'Forbidden: Access denied to this tenant partition' },
};

function deny(options, key) {
  const override = options[key] || {};
  const base = DEFAULT_MESSAGES[key];
  return errorResponse(override.message ?? base.message, override.status ?? base.status);
}

/** True when the token carries either realm tag (v2 userType OR legacy posType). */
function isPosToken(payload) {
  return payload.posType === 'pos' || payload.userType === 'org';
}

/**
 * Extract the access token from a Request: `Authorization: Bearer <jwt>`
 * first, then (when allowed) the `token` query parameter — EventSource
 * cannot set custom headers. Header wins when both are present.
 */
export function extractRequestToken(request, { allowQueryToken = false } = {}) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  if (allowQueryToken) {
    try {
      return new URL(request.url).searchParams.get('token') || null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Activity probe shared with the tenants.js soft elevation path (which must
 * never reject). Admin realm keeps the legacy SQL verbatim; org users add
 * the deleted_at guard mirroring posAuth.
 */
export async function isActiveAdmin(env, userId) {
  const { results } = await env.DB.prepare('SELECT is_active FROM admins WHERE id = ?')
    .bind(userId)
    .all();
  return results.length > 0 && results[0].is_active !== 0;
}

async function checkActivity(env, decoded) {
  if (isPosToken(decoded)) {
    const { results } = await env.DB.prepare(
      'SELECT is_active FROM pos_users WHERE id = ? AND deleted_at IS NULL'
    ).bind(decoded.userId || decoded.sub).all();
    return results.length > 0 && !!results[0].is_active;
  }
  return isActiveAdmin(env, decoded.userId || decoded.sub);
}

/**
 * Factory: returns `async function gate(request, env, ctx)` returning a
 * failure Response, or `{ user }` holding the verified JWT payload on
 * success. Also usable directly as Hono middleware — when called with a
 * context and a `next` function it sets `user` and continues.
 */
export function requireAuth(options = {}) {
  const {
    realm = 'admin',
    roles = null,
    requireTenant = true,
    allowQueryToken = false,
    checkActive = true,
  } = options;

  async function evaluate(request, env, ctx = {}) {
    // ── 1. Signature verification ────────────────────────────
    const token = extractRequestToken(request, { allowQueryToken });
    if (!token) return deny(options, 'missingToken');
    const decoded = await verifyToken(token, env.JWT_SECRET);
    if (!decoded) return deny(options, 'invalidToken');

    // ── 2. Realm match (before anything else — fixes the 401-vs-403 quirk:
    //       a POS token on an admin route must never surface the misleading
    //       401 "Account deactivated") ──────────────────────────────────
    const tokenIsPos = isPosToken(decoded);
    if (realm === 'admin' && tokenIsPos) return deny(options, 'realmMismatch');
    if (realm === 'pos' && !tokenIsPos) return deny(options, 'realmMismatch');

    // ── 3. Role membership (domain-paired by step 2) ──────────
    if (roles && !roles.includes(decoded.role)) return deny(options, 'insufficientRole');

    // ── 4. Credential re-validation on EVERY authenticated request ──
    // A throwing probe propagates (→ app.onError 500), matching the inline
    // gates it replaces; only an authoritative "no active row" denies.
    if (checkActive && !(await checkActivity(env, decoded))) {
      return deny(options, 'deactivated');
    }

    // ── 5. Tenant scope (super-admin bypass preserved) ────────
    // 'equals'  — claim must match ctx.tenantId (payments, meal-schedules,
    //             catch-all).
    // 'lenient' — legacy SSE predicate: an admin with NO tenantId claim is
    //             not denied (byte-compat with /api/stream/orders).
    if (requireTenant && decoded.role !== 'super_admin') {
      const mismatch = options.scopeMode === 'lenient'
        ? !!decoded.tenantId && decoded.tenantId !== ctx.tenantId
        : decoded.tenantId !== ctx.tenantId;
      if (mismatch) return deny(options, 'scopeDenied');
    }

    return { user: decoded };
  }

  async function gate(a, b, c) {
    // Hono middleware mode: gate(context, next)
    if (typeof b === 'function') {
      const result = await evaluate(a.req.raw, a.env);
      if (result instanceof Response) return result;
      a.set('user', result.user);
      await b();
      return undefined;
    }
    // Imperative mode: gate(request, env, { tenantId })
    return evaluate(a, b, c);
  }

  return gate;
}

export default requireAuth;
