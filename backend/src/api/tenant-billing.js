import { jsonResponse, errorResponse } from '../utils/response';
import { Hono } from 'hono';

/**
 * Tenant Billing — tenant-scoped (not super-admin).
 *
 * GET / — returns current tenant's subscription/plan info, usage stats, billing history.
 * Auth is handled by resolveScope() middleware in index.js (admin realm).
 *
 * Uses tenant_subscriptions.plan_id (FK to subscription_plans) — not a bare "plan" column.
 */

const ALL_PLANS = [
  { id: 'plan_free', name: 'Free', slug: 'free', price: '$0', period: '/mo', bookingsLimit: 100, storageLimit: '1 GB', posUsersLimit: 2, features: ['100 bookings/mo', '1 GB storage', '2 POS users', 'Basic reports', 'Email support'] },
  { id: 'plan_starter', name: 'Starter', slug: 'starter', price: '$49', period: '/mo', bookingsLimit: 1000, storageLimit: '10 GB', posUsersLimit: 5, features: ['1,000 bookings/mo', '10 GB storage', '5 POS users', 'Advanced analytics', 'Priority support'] },
  { id: 'plan_pro', name: 'Professional', slug: 'professional', price: '$149', period: '/mo', bookingsLimit: 10000, storageLimit: '100 GB', posUsersLimit: 20, features: ['10,000 bookings/mo', '100 GB storage', '20 POS users', 'Custom branding', 'API access', 'Dedicated support'] },
  { id: 'plan_enterprise', name: 'Enterprise', slug: 'enterprise', price: 'Custom', period: '', bookingsLimit: null, storageLimit: 'Unlimited', posUsersLimit: null, features: ['Everything in Pro', 'Unlimited storage', 'Unlimited POS users', 'SSO / SAML', 'SLA guarantee', 'On-site setup'] },
];

const PLAN_MAP = Object.fromEntries(ALL_PLANS.map(p => [p.slug, p]));

export const tenantBillingRoutes = new Hono();

// GET /api/tenant/billing — current tenant's subscription + usage
tenantBillingRoutes.get('/', async (c) => {
  try {
    const tenantId = c.get('scope')?.tenantId;
    if (!tenantId) return errorResponse('Tenant not found', 404);

    // 1. Fetch subscription record with plan details
    const subscription = await c.env.DB.prepare(
      `SELECT ts.*, sp.name as plan_name, sp.slug as plan_slug, sp.price_monthly, sp.price_yearly,
              sp.max_rooms, sp.max_orders_monthly, sp.max_pos_users, sp.max_storage_mb, sp.features
       FROM tenant_subscriptions ts
       LEFT JOIN subscription_plans sp ON ts.plan_id = sp.id
       WHERE ts.tenant_id = ?`
    ).bind(tenantId).first();

    const planSlug = subscription?.plan_slug || 'free';
    const planInfo = PLAN_MAP[planSlug] || PLAN_MAP.free;

    // 2. Usage: order count (this billing period)
    const orderCount = await c.env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM orders WHERE tenant_id = ? AND deleted_at IS NULL"
    ).bind(tenantId).first();

    // 3. Usage: POS user count
    const posUserCount = await c.env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM pos_users WHERE organization_id IN (SELECT organization_id FROM tenant_org_mapping WHERE tenant_id = ?) AND is_active = 1"
    ).bind(tenantId).first();

    // 4. Billing history (last 10 invoices from tenant_subscriptions audit or similar)
    const billingHistory = [];
    if (subscription?.current_period_end) {
      billingHistory.push({
        id: 'current',
        date: subscription.created_at || new Date().toISOString(),
        amount: subscription.price_monthly || 0,
        status: subscription.status || 'active',
        description: `${planInfo.name} plan`,
      });
    }

    return jsonResponse({
      subscription: {
        planId: subscription?.plan_id || 'plan_free',
        plan: planSlug,
        planLabel: planInfo.name,
        price: subscription?.price_monthly || 0,
        status: subscription?.status || 'active',
        currentPeriodEnd: subscription?.current_period_end || null,
        trialEndsAt: subscription?.trial_ends_at || null,
        bookingsLimit: subscription?.bookings_limit || subscription?.max_orders_monthly || planInfo.bookingsLimit,
      },
      usage: {
        bookings: orderCount?.cnt || 0,
        bookingsLimit: subscription?.bookings_limit || subscription?.max_orders_monthly || planInfo.bookingsLimit,
        posUsers: posUserCount?.cnt || 0,
        posUsersLimit: subscription?.max_pos_users || planInfo.posUsersLimit,
      },
      plans: ALL_PLANS,
      billingHistory,
    });
  } catch (e) {
    return errorResponse('Failed to fetch billing info');
  }
});

tenantBillingRoutes.all('*', () => jsonResponse({ error: 'Method not allowed' }, 405));

export default tenantBillingRoutes;
