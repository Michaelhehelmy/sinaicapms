import { Hono } from 'hono';
import { jsonResponse, errorResponse } from '../utils/response';
import { validationError } from '../utils/errors';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

/**
 * Self-service onboarding sub-router.
 *
 * Mounted by index.js as:
 *   app.route('/api', onboardingRoutes)
 *
 * Public endpoints — no auth required (token is the auth).
 */

// ── Signup schema ────────────────────────────────────────────────────────
const signupSchema = z.object({
  name: z.string().min(1, 'Business name is required'),
  subdomain: z.string().min(3, 'Subdomain must be at least 3 characters'),
  business_type: z.enum(['camp', 'supermarket', 'transportation', 'other']).default('camp'),
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
}).strip();

// ── Partial wizard update schema ─────────────────────────────────────────
// T1 (P0.1): whitelist is the ONLY source of tenant columns for dynamic
// UPDATEs. Any key outside this list is stripped by .strip() and can never
// reach the SET clause — closes the SQL injection via column-name smuggling.
const tenantUpdateSchema = z.object({
  location: z.string().optional(),
  phone: z.string().optional(),
  description: z.string().optional(),
  primary_color: z.string().optional(),
  capacity: z.number().optional(),
  currency: z.string().optional(),
}).strip();

// ── Setup step schema ───────────────────────────────────────────────────
const setupSchema = z.object({
  token: z.string().min(1),
  location: z.string().optional(),
  phone: z.string().optional(),
  description: z.string().optional(),
  primary_color: z.string().optional(),
  capacity: z.number().optional(),
  currency: z.string().optional(),
  activities: z.string().optional(),
}).strip();

// ── U-004: onboarding bearer-token TTL ───────────────────────────────────
// Tokens carry a 7-day expiry (onboarding_token_expires_at, migration 0114).
// A NULL expiry is treated as VALID (legacy rows the backfill could not see),
// so no live token is bricked; a past expiry is gone (410). Completion burns
// BOTH columns to NULL (single-use); re-use of a completed token is 410.
const ONBOARDING_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ONBOARDING_EXPIRED_MESSAGE = 'Onboarding link expired. Contact support.';
const ONBOARDING_COMPLETED_MESSAGE = 'Onboarding already completed.';

function isOnboardingTokenExpired(tenant) {
  if (!tenant?.onboarding_token_expires_at) return false;
  return new Date(tenant.onboarding_token_expires_at).getTime() < Date.now();
}

const onboardingRoutes = new Hono();

// ── POST /api/public/signup ─────────────────────────────────────────────
// Creates a pending tenant + admin, returns onboarding token.
onboardingRoutes.post('/public/signup', async (c) => {
  const env = c.env;
  try {
    const parsed = signupSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { name, subdomain, business_type, email, password, first_name, last_name } = parsed.data;

    // Validate subdomain format
    if (!/^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/.test(subdomain)) {
      return errorResponse('Subdomain must be lowercase alphanumeric with hyphens, 3-63 chars', 400);
    }

    // Check subdomain uniqueness
    const existing = await env.DB.prepare(
      'SELECT id FROM tenants WHERE subdomain = ?'
    ).bind(subdomain).all();
    if (existing.results.length > 0) {
      return errorResponse('This subdomain is already taken', 400);
    }

    // Check email uniqueness for admins
    const existingAdmin = await env.DB.prepare(
      'SELECT id FROM admins WHERE email = ?'
    ).bind(email).all();
    if (existingAdmin.results.length > 0) {
      return errorResponse('An account with this email already exists', 400);
    }

    const tid = 'tenant_' + crypto.randomUUID().slice(0, 12);
    const adminId = 'adm_' + crypto.randomUUID().slice(0, 12);
    const onboardingToken = crypto.randomUUID();
    // U-004: stamp the 7-day TTL at generation.
    const onboardingTokenExpiresAt = new Date(Date.now() + ONBOARDING_TOKEN_TTL_MS).toISOString();
    const hashedPassword = await bcrypt.hash(password, 12);

    // Provision tenant + admin + POS org/store + mapping in ONE atomic batch.
    // The org id is resolved inside the same batch via subquery so the store
    // and tenant_org_mapping rows reference the auto-incremented organization
    // (D1 runs batch statements in order, in a single transaction). Any failure
    // rolls back ALL rows — no orphan tenant/admin can be left behind.
    const slug = ('org_' + tid).replace(/[^a-zA-Z0-9_]/g, '_');

    await env.DB.batch([
      // 1. Tenant row in pending_setup status
      env.DB.prepare(
        `INSERT INTO tenants (
          id, subdomain, name, type, email, status,
          onboarding_token, onboarding_token_expires_at, onboarding_status, primary_color, capacity, currency, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending_setup', ?, ?, 'pending_setup', '#4a7c4f', 50, 'EGP', datetime('now'), datetime('now'))`
      ).bind(tid, subdomain, name, business_type || 'camp', email, onboardingToken, onboardingTokenExpiresAt),
      // 2. Admin account — T6 (P0.2): starts INACTIVE. Login queries already
      //    gate `is_active = 1` (auth.js), so the account cannot be used until
      //    the onboarding wizard completes (setup flow flips it active).
      env.DB.prepare(
        `INSERT INTO admins (id, tenant_id, email, password_hash, role, first_name, last_name, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'admin', ?, ?, 0, datetime('now'), datetime('now'))`
      ).bind(adminId, tid, email, hashedPassword, first_name, last_name),
      // 3. Default POS organization (id auto-increments; slug is UNIQUE)
      env.DB.prepare(
        `INSERT INTO pos_organizations (name, slug, created_at, updated_at)
         VALUES (?, ?, datetime('now'), datetime('now'))`
      ).bind(name, slug),
      // 4. Default POS store for the new organization
      env.DB.prepare(
        `INSERT INTO pos_stores (organization_id, name, code, address, city, created_at, updated_at)
         VALUES ((SELECT id FROM pos_organizations WHERE slug = ?), ?, ?, 'N/A', 'N/A', datetime('now'), datetime('now'))`
      ).bind(slug, tid + ' Store', 'ST_' + tid),
      // 5. Tenant ↔ POS organization mapping
      env.DB.prepare(
        `INSERT INTO tenant_org_mapping (tenant_id, organization_id)
         VALUES (?, (SELECT id FROM pos_organizations WHERE slug = ?))`
      ).bind(tid, slug),
    ]);

    return jsonResponse({
      success: true,
      tenant_id: tid,
      onboarding_token: onboardingToken,
      message: 'Account created and is pending activation. Complete the onboarding wizard to activate your login.',
    }, 201);
  } catch (e) {
    console.error('[ONBOARDING SIGNUP]', e?.message || e);
    return jsonResponse({
      success: false,
      error: 'Signup failed. Please try again.',
      detail: e?.message || String(e),
    }, 500);
  }
});

// ── GET /api/onboarding/status/:token ───────────────────────────────────
// Returns the current onboarding status for a given token.
onboardingRoutes.get('/onboarding/status/:token', async (c) => {
  const env = c.env;
  const token = c.req.param('token');
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, name, subdomain, email, status, onboarding_status,
              onboarding_token_expires_at,
              location, phone, description, primary_color, capacity, currency
       FROM tenants WHERE onboarding_token = ?`
    ).bind(token).all();

    if (results.length === 0) {
      return errorResponse('Invalid onboarding link', 404);
    }

    const tenant = results[0];
    // U-004: expired links are gone (410), not invalid (404).
    if (isOnboardingTokenExpired(tenant)) {
      return errorResponse(ONBOARDING_EXPIRED_MESSAGE, 410);
    }
    return jsonResponse({
      tenant_id: tenant.id,
      name: tenant.name,
      subdomain: tenant.subdomain,
      email: tenant.email,
      status: tenant.status,
      onboarding_status: tenant.onboarding_status,
      setup_complete: tenant.onboarding_status === 'completed',
      profile: {
        location: tenant.location,
        phone: tenant.phone,
        description: tenant.description,
        primary_color: tenant.primary_color,
        capacity: tenant.capacity,
        currency: tenant.currency,
      },
    });
  } catch (e) {
    console.error('[ONBOARDING STATUS]', e?.message || e);
    return errorResponse('Failed to check onboarding status', 500);
  }
});

// ── POST /api/onboarding/setup ──────────────────────────────────────────
// Updates tenant profile and marks onboarding as complete.
onboardingRoutes.post('/onboarding/setup', async (c) => {
  const env = c.env;
  try {
    const parsed = setupSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return validationError(parsed);
    }
    const { token, ...fields } = parsed.data;

    // Verify token
    const { results } = await env.DB.prepare(
      'SELECT id, onboarding_status, onboarding_token_expires_at FROM tenants WHERE onboarding_token = ?'
    ).bind(token).all();

    if (results.length === 0) {
      return errorResponse('Invalid onboarding link', 404);
    }

    const tenant = results[0];
    // U-004: re-use after completion is gone (410), not a bad request (400).
    if (tenant.onboarding_status === 'completed') {
      return errorResponse(ONBOARDING_COMPLETED_MESSAGE, 410);
    }
    if (isOnboardingTokenExpired(tenant)) {
      return errorResponse(ONBOARDING_EXPIRED_MESSAGE, 410);
    }

    // Build dynamic update
    const updates = [];
    const bindArgs = [];
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null && value !== '') {
        updates.push(`${key} = ?`);
        bindArgs.push(value);
      }
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      bindArgs.push(tenant.id);
      await env.DB.prepare(
        `UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...bindArgs).run();
    }

    // Mark onboarding complete — T1 (P0.1): the onboarding token is cleared
    // once consumed so it can never be reused or echoed after use.
    // U-004: burn BOTH the token and its expiry (single-use); any re-use of
    // a completed token answers 410 via the completed-check above.
    await env.DB.prepare(
      `UPDATE tenants SET onboarding_status = 'completed', status = 'active', onboarding_token = NULL, onboarding_token_expires_at = NULL, updated_at = datetime('now') WHERE id = ?`
    ).bind(tenant.id).run();

    // T6 (P0.2): activate the tenant's admin only after the wizard completes.
    await env.DB.prepare(
      `UPDATE admins SET is_active = 1 WHERE tenant_id = ? AND role = 'admin'`
    ).bind(tenant.id).run();

    // C1.1: Generate auto-login token (24-hour expiry) for the tenant's admin
    const autoLoginToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare(
      `UPDATE admins SET auto_login_token = ?, auto_login_expires_at = datetime(?) WHERE tenant_id = ? AND role = 'admin'`
    ).bind(autoLoginToken, expiresAt, tenant.id).run();

    // Build subdomain URL for the tenant
    const subdomainUrl = `https://${tenant.id}.sinaicamps.com`;

    return jsonResponse({
      success: true,
      tenant_id: tenant.id,
      message: 'Onboarding complete! Your site is now live.',
      site_url: subdomainUrl,
      auto_login_token: autoLoginToken,
    });
  } catch (e) {
    console.error('[ONBOARDING SETUP]', e?.message || e);
    return errorResponse('Onboarding setup failed', 500);
  }
});

// ── POST /api/onboarding/tenant ─────────────────────────────────────────
// Partial update during the wizard (doesn't complete onboarding).
onboardingRoutes.post('/onboarding/tenant', async (c) => {
  const env = c.env;
  try {
    // T1 (P0.1): body is validated against the tenantUpdateSchema whitelist.
    // token is read before parsing because .strip() drops it from parsed.data;
    // every key that reaches the SET clause is a fixed, schema-declared column.
    const body = await c.req.json();
    const token = typeof body?.token === 'string' ? body.token : '';
    if (!token) return errorResponse('Token is required', 400);

    const parsed = tenantUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed);
    }

    const { results } = await env.DB.prepare(
      'SELECT id, onboarding_token_expires_at FROM tenants WHERE onboarding_token = ?'
    ).bind(token).all();

    if (results.length === 0) {
      return errorResponse('Invalid onboarding link', 404);
    }

    // U-004: expired links are gone (410), not invalid (404).
    if (isOnboardingTokenExpired(results[0])) {
      return errorResponse(ONBOARDING_EXPIRED_MESSAGE, 410);
    }

    const tenantId = results[0].id;

    const updates = [];
    const bindArgs = [];
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined && value !== null && value !== '') {
        updates.push(`${key} = ?`);
        bindArgs.push(value);
      }
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      bindArgs.push(tenantId);
      await env.DB.prepare(
        `UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...bindArgs).run();
    }

    return jsonResponse({ success: true, tenant_id: tenantId });
  } catch (e) {
    console.error('[ONBOARDING TENANT UPDATE]', e?.message || e);
    return errorResponse('Failed to update tenant', 500);
  }
});

export default onboardingRoutes;
