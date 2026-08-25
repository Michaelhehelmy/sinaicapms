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
  password: z.string().min(6, 'Password must be at least 6 characters'),
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
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
      return errorResponse('Subdomain must be lowercase alphanumeric with hyphens, 3-63 chars');
    }

    // Check subdomain uniqueness
    const existing = await env.DB.prepare(
      'SELECT id FROM tenants WHERE subdomain = ?'
    ).bind(subdomain).all();
    if (existing.results.length > 0) {
      return errorResponse('This subdomain is already taken');
    }

    // Check email uniqueness for admins
    const existingAdmin = await env.DB.prepare(
      'SELECT id FROM admins WHERE email = ?'
    ).bind(email).all();
    if (existingAdmin.results.length > 0) {
      return errorResponse('An account with this email already exists');
    }

    const tid = 'tenant_' + crypto.randomUUID().slice(0, 12);
    const adminId = 'adm_' + crypto.randomUUID().slice(0, 12);
    const onboardingToken = crypto.randomUUID();
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create tenant in pending_setup status
    await env.DB.prepare(
      `INSERT INTO tenants (
        id, subdomain, name, type, email, status,
        onboarding_token, onboarding_status, primary_color, capacity, currency, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'pending_setup', ?, 'pending_setup', '#4a7c4f', 50, 'EGP', datetime('now'), datetime('now'))`
    ).bind(tid, subdomain, name, business_type || 'camp', email, onboardingToken).run();

    // Create admin account
    await env.DB.prepare(
      `INSERT INTO admins (id, tenant_id, email, password_hash, role, first_name, last_name, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'admin', ?, ?, 1, datetime('now'), datetime('now'))`
    ).bind(adminId, tid, email, hashedPassword, first_name, last_name).run();

    // Create default POS organization for the tenant
    const orgId = 'org_' + crypto.randomUUID().slice(0, 12);
    await env.DB.prepare(
      `INSERT INTO pos_organizations (id, tenant_id, name, created_at) VALUES (?, ?, ?, datetime('now'))`
    ).bind(orgId, tid, name).run();

    return jsonResponse({
      success: true,
      tenant_id: tid,
      onboarding_token: onboardingToken,
      message: 'Account created. Check your email for next steps.',
    }, 201);
  } catch (e) {
    return errorResponse('Signup failed: ' + (e.message || 'Unknown error'), 500);
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
              location, phone, description, primary_color, capacity, currency
       FROM tenants WHERE onboarding_token = ?`
    ).bind(token).all();

    if (results.length === 0) {
      return errorResponse('Invalid onboarding link', 404);
    }

    const tenant = results[0];
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
    return errorResponse('Failed to check onboarding status');
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
      'SELECT id, onboarding_status FROM tenants WHERE onboarding_token = ?'
    ).bind(token).all();

    if (results.length === 0) {
      return errorResponse('Invalid onboarding link', 404);
    }

    const tenant = results[0];
    if (tenant.onboarding_status === 'completed') {
      return errorResponse('Onboarding already completed', 400);
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

    // Mark onboarding complete
    await env.DB.prepare(
      `UPDATE tenants SET onboarding_status = 'completed', status = 'active', updated_at = datetime('now') WHERE id = ?`
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
    return errorResponse('Onboarding setup failed');
  }
});

// ── POST /api/onboarding/tenant ─────────────────────────────────────────
// Partial update during the wizard (doesn't complete onboarding).
onboardingRoutes.post('/onboarding/tenant', async (c) => {
  const env = c.env;
  try {
    const body = await c.req.json();
    const { token, ...fields } = body;
    if (!token) return errorResponse('Token is required');

    const { results } = await env.DB.prepare(
      'SELECT id FROM tenants WHERE onboarding_token = ?'
    ).bind(token).all();

    if (results.length === 0) {
      return errorResponse('Invalid onboarding link', 404);
    }

    const tenantId = results[0].id;

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
      bindArgs.push(tenantId);
      await env.DB.prepare(
        `UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...bindArgs).run();
    }

    return jsonResponse({ success: true, tenant_id: tenantId });
  } catch (e) {
    return errorResponse('Failed to update tenant');
  }
});

export default onboardingRoutes;
