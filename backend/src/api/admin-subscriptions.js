import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { requireAuth } from '../middleware/requireAuth.js';
import { parsePagination, paginationEnvelope } from '../utils/pagination';
import { Hono } from 'hono';
import { z } from 'zod';

/**
 * Subscription Management — Super Admin only.
 *
 * Tracks tenant plans (free/starter/pro/enterprise), status, usage, and billing.
 * The tenant_subscriptions table is a singleton-per-tenant record, using plan_id
 * as FK to subscription_plans (created by migration 0075).
 *
 * Mounting (index.js):
 *   app.use('/api/admin/subscriptions', superAdminGate);
 *   app.route('/api/admin/subscriptions', adminSubscriptionsRoutes);
 */

const superAdminGate = requireAuth({
  realm: 'admin',
  roles: ['super_admin'],
  requireTenant: false,
  invalidToken: { status: 403, message: 'Unauthorized: Super Admin access required' },
  realmMismatch: { message: 'Unauthorized: Super Admin access required' },
  insufficientRole: { message: 'Unauthorized: Super Admin access required' },
});

const updateSubscriptionSchema = z.object({
  plan: z.enum(['free', 'starter', 'pro', 'enterprise']).optional(),
  status: z.enum(['active', 'canceled', 'past_due']).optional(),
  trialEndsAt: z.string().nullable().optional(),
  currentPeriodEnd: z.string().nullable().optional(),
  bookingsLimit: z.number().int().min(0).optional(),
}).strip();

// Plan limits for display
const PLAN_LIMITS = {
  free: { bookings: 100, label: 'Free' },
  starter: { bookings: 1000, label: 'Starter' },
  pro: { bookings: 10000, label: 'Pro' },
  enterprise: { bookings: 999999, label: 'Enterprise' },
};

// ─── Router ────────────────────────────────────────────────────
export const adminSubscriptionsRoutes = new Hono();

// GET /api/admin/subscriptions — list all tenant subscriptions
adminSubscriptionsRoutes.get('/', async (c) => {
  const auth = await superAdminGate(c.req.raw, c.env);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(c.req.url);
    const { page, pageSize, offset } = parsePagination(url);

    // Filter by plan or status
    const planFilter = url.searchParams.get('plan');
    const statusFilter = url.searchParams.get('status');
    const searchFilter = url.searchParams.get('search');

    let countQuery = `
      SELECT COUNT(*) as total FROM tenant_subscriptions ts
      LEFT JOIN tenants t ON ts.tenant_id = t.id
    `;
    let dataQuery = `
      SELECT ts.*, t.name as tenant_name, sp.name as plan_name, sp.slug as plan_slug, sp.price_monthly, sp.price_yearly
      FROM tenant_subscriptions ts
      LEFT JOIN tenants t ON ts.tenant_id = t.id
      LEFT JOIN subscription_plans sp ON ts.plan_id = sp.id
    `;

    const conditions = [];
    const bindings = [];

    if (planFilter) {
      conditions.push('(ts.plan_id = ? OR sp.slug = ?)');
      bindings.push(planFilter, planFilter);
    }
    if (statusFilter) {
      conditions.push('ts.status = ?');
      bindings.push(statusFilter);
    }
    if (searchFilter) {
      conditions.push('(t.name LIKE ? OR ts.tenant_id LIKE ?)');
      bindings.push(`%${searchFilter}%`, `%${searchFilter}%`);
    }

    const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
    countQuery += whereClause;
    dataQuery += whereClause;

    const { results: countResults } = await c.env.DB.prepare(countQuery).bind(...bindings).all();
    const total = countResults[0]?.total || 0;

    dataQuery += ' ORDER BY ts.created_at DESC LIMIT ? OFFSET ?';
    const { results } = await c.env.DB.prepare(dataQuery)
      .bind(...bindings, pageSize, offset).all();

    // Enrich with usage percentage
    const enriched = results.map((row) => {
      const limit = PLAN_LIMITS[row.plan_slug]?.bookings || PLAN_LIMITS.free.bookings;
      const used = row.bookings_used || 0;
      return {
        tenantId: row.tenant_id,
        tenantName: row.tenant_name || row.tenant_id,
        planId: row.plan_id,
        planName: row.plan_name || row.plan_slug || 'free',
        planSlug: row.plan_slug || 'free',
        priceMonthly: row.price_monthly || 0,
        priceYearly: row.price_yearly || 0,
        status: row.status,
        trialEndsAt: row.trial_ends_at,
        currentPeriodEnd: row.current_period_end,
        usage: {
          bookings: used,
          limit: row.bookings_limit || limit,
          percent: Math.min(100, Math.round((used / (row.bookings_limit || limit)) * 100)),
        },
        totalPaid: row.total_paid || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    return jsonResponse(paginationEnvelope(enriched, total, page, pageSize));
  } catch (e) {
    return errorResponse('Failed to fetch subscriptions');
  }
});

// PUT /api/admin/subscriptions/:id — update a subscription (id = tenantId)
adminSubscriptionsRoutes.put('/:id', async (c) => {
  const auth = await superAdminGate(c.req.raw, c.env);
  if (auth instanceof Response) return auth;

  try {
    const tenantId = c.req.param('id');
    const body = toSnake(await c.req.json());
    const parsed = updateSubscriptionSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse({ success: false, error: 'Invalid subscription data', errors: parsed.error.issues }, 400);
    }

    // Upsert subscription record
    const existing = await c.env.DB.prepare(
      'SELECT id FROM tenant_subscriptions WHERE tenant_id = ?'
    ).bind(tenantId).first();

    if (!existing) {
      // Resolve plan slug to plan_id
      const planSlug = parsed.data.plan || 'free';
      const planRow = await c.env.DB.prepare(
        'SELECT id, max_orders_monthly FROM subscription_plans WHERE slug = ?'
      ).bind(planSlug).first();
      const planId = planRow?.id || 'plan_free';
      const limit = planRow?.max_orders_monthly || 100;
      await c.env.DB.prepare(
        `INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, trial_ends_at, current_period_end, bookings_limit, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(
        tenantId,
        planId,
        parsed.data.status || 'active',
        parsed.data.trial_ends_at || parsed.data.trialEndsAt || null,
        parsed.data.current_period_end || parsed.data.currentPeriodEnd || null,
        parsed.data.bookings_limit || parsed.data.bookingsLimit || limit,
      ).run();
    } else {
      // Update existing
      const updates = [];
      const params = [];

      if (parsed.data.plan) {
        // Resolve plan slug to plan_id
        const planRow = await c.env.DB.prepare(
          'SELECT id, max_orders_monthly FROM subscription_plans WHERE slug = ?'
        ).bind(parsed.data.plan).first();
        if (planRow) {
          updates.push('plan_id = ?');
          params.push(planRow.id);
          // Auto-update limit based on plan
          if (!parsed.data.bookingsLimit && !parsed.data.bookings_limit) {
            updates.push('bookings_limit = ?');
            params.push(planRow.max_orders_monthly || 100);
          }
        }
      }
      if (parsed.data.status) {
        updates.push('status = ?');
        params.push(parsed.data.status);
      }
      const trialEnd = parsed.data.trial_ends_at !== undefined ? parsed.data.trial_ends_at : parsed.data.trialEndsAt;
      if (trialEnd !== undefined) {
        updates.push('trial_ends_at = ?');
        params.push(trialEnd);
      }
      const periodEnd = parsed.data.current_period_end !== undefined ? parsed.data.current_period_end : parsed.data.currentPeriodEnd;
      if (periodEnd !== undefined) {
        updates.push('current_period_end = ?');
        params.push(periodEnd);
      }
      const bookingsLimit = parsed.data.bookings_limit !== undefined ? parsed.data.bookings_limit : parsed.data.bookingsLimit;
      if (bookingsLimit !== undefined) {
        updates.push('bookings_limit = ?');
        params.push(bookingsLimit);
      }

      if (updates.length === 0) {
        return jsonResponse({ success: false, error: 'No fields to update' }, 400);
      }

      updates.push("updated_at = datetime('now')");
      params.push(tenantId);

      await c.env.DB.prepare(
        `UPDATE tenant_subscriptions SET ${updates.join(', ')} WHERE tenant_id = ?`
      ).bind(...params).run();
    }

    return jsonResponse({ success: true, tenantId });
  } catch (e) {
    return errorResponse('Failed to update subscription');
  }
});

// POST /api/admin/subscriptions/:id/cancel — cancel a subscription
adminSubscriptionsRoutes.post('/:id/cancel', async (c) => {
  const auth = await superAdminGate(c.req.raw, c.env);
  if (auth instanceof Response) return auth;

  try {
    const tenantId = c.req.param('id');

    // Upsert if not exists
    const existing = await c.env.DB.prepare(
      'SELECT id FROM tenant_subscriptions WHERE tenant_id = ?'
    ).bind(tenantId).first();

    if (!existing) {
      // Look up free plan_id
      const freePlan = await c.env.DB.prepare(
        "SELECT id FROM subscription_plans WHERE slug = 'free'"
      ).first();
      const freePlanId = freePlan?.id || 'plan_free';
      await c.env.DB.prepare(
        `INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, bookings_limit, updated_at)
         VALUES (?, ?, 'canceled', 100, datetime('now'))`
      ).bind(tenantId, freePlanId).run();
    } else {
      await c.env.DB.prepare(
        `UPDATE tenant_subscriptions SET status = 'canceled', updated_at = datetime('now') WHERE tenant_id = ?`
      ).bind(tenantId).run();
    }

    return jsonResponse({ success: true, tenantId, status: 'canceled' });
  } catch (e) {
    return errorResponse('Failed to cancel subscription');
  }
});

// POST /api/admin/subscriptions/:id/resume — resume a canceled subscription
adminSubscriptionsRoutes.post('/:id/resume', async (c) => {
  const auth = await superAdminGate(c.req.raw, c.env);
  if (auth instanceof Response) return auth;

  try {
    const tenantId = c.req.param('id');
    await c.env.DB.prepare(
      `UPDATE tenant_subscriptions SET status = 'active', updated_at = datetime('now') WHERE tenant_id = ? AND status = 'canceled'`
    ).bind(tenantId).run();

    return jsonResponse({ success: true, tenantId, status: 'active' });
  } catch (e) {
    return errorResponse('Failed to resume subscription');
  }
});

adminSubscriptionsRoutes.all('*', () => jsonResponse({ error: 'Method not allowed' }, 405));

export default adminSubscriptionsRoutes;
