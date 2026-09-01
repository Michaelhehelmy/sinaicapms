import { jsonResponse, errorResponse, toSnake } from '../utils/response';
import { requireAuth } from '../middleware/requireAuth.js';
import { Hono } from 'hono';
import { z } from 'zod';

/**
 * System Settings — platform-wide configuration (Super Admin only).
 *
 * Settings are stored as JSON blobs in a singleton platform_settings row (id=1).
 * On first read the row is auto-created with defaults if it doesn't exist.
 *
 * Mounting (index.js):
 *   const superSettingsGate = requireAuth({ realm: 'admin', roles: ['super_admin'], requireTenant: false });
 *   app.use('/api/admin/settings', superSettingsGate);
 *   app.route('/api/admin/settings', adminSettingsRoutes);
 */

const superSettingsGate = requireAuth({
  realm: 'admin',
  roles: ['super_admin'],
  requireTenant: false,
  invalidToken: { status: 403, message: 'Unauthorized: Super Admin access required' },
  realmMismatch: { message: 'Unauthorized: Super Admin access required' },
  insufficientRole: { message: 'Unauthorized: Super Admin access required' },
});

const settingsUpdateSchema = z.object({
  featureFlags: z.record(z.boolean()).optional(),
  emailTemplates: z.record(z.object({
    subject: z.string(),
    body: z.string(),
  })).optional(),
  defaults: z.object({
    taxRate: z.number().min(0).max(100).optional(),
    currency: z.string().optional(),
    timezone: z.string().optional(),
    dateFormat: z.string().optional(),
  }).optional(),
  branding: z.object({
    platformName: z.string().optional(),
    logoUrl: z.string().nullable().optional(),
    faviconUrl: z.string().nullable().optional(),
    primaryColor: z.string().optional(),
  }).optional(),
  payment: z.object({
    enabled: z.boolean().optional(),
    secretKey: z.string().optional(),
    hmacSecret: z.string().optional(),
    integrationIds: z.string().optional(),
    baseUrl: z.string().optional(),
    publicKey: z.string().optional(),
    currency: z.string().optional(),
    marketplaceFeePct: z.number().min(0).max(100).optional(),
  }).optional(),
}).strip();

const DEFAULT_SETTINGS = {
  featureFlags: { financials: false, hr: false, supply: false, crm: false, storefront: false, ai: false },
  emailTemplates: {
    welcome: { subject: 'Welcome to SinaiCamps', body: 'Welcome aboard!' },
    invoice: { subject: 'Your Invoice', body: 'Thank you for your purchase.' },
    passwordReset: { subject: 'Reset Your Password', body: 'Click the link to reset your password.' },
  },
  defaults: { taxRate: 0, currency: 'USD', timezone: 'UTC', dateFormat: 'YYYY-MM-DD' },
  branding: { platformName: 'SinaiCamps', logoUrl: null, faviconUrl: null, primaryColor: '#16a34a' },
  payment: {
    enabled: false,
    secretKey: '',
    hmacSecret: '',
    integrationIds: '',
    baseUrl: 'https://accept.paymob.com',
    publicKey: '',
    currency: 'EGP',
    marketplaceFeePct: 0,
  },
};

/**
 * Ensure the singleton settings row exists. Called on first GET.
 */
async function ensureSettingsRow(DB) {
  const existing = await DB.prepare('SELECT id FROM platform_settings WHERE id = 1').first();
  if (!existing) {
    await DB.prepare(
      `INSERT INTO platform_settings (id, feature_flags, email_templates, defaults, branding, payment, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      JSON.stringify(DEFAULT_SETTINGS.featureFlags),
      JSON.stringify(DEFAULT_SETTINGS.emailTemplates),
      JSON.stringify(DEFAULT_SETTINGS.defaults),
      JSON.stringify(DEFAULT_SETTINGS.branding),
      JSON.stringify(DEFAULT_SETTINGS.payment),
    ).run();
  }
}

function parseSettingsRow(row) {
  if (!row) return DEFAULT_SETTINGS;
  const paymentRaw = safeParse(row.payment, DEFAULT_SETTINGS.payment);
  return {
    featureFlags: safeParse(row.feature_flags, DEFAULT_SETTINGS.featureFlags),
    emailTemplates: safeParse(row.email_templates, DEFAULT_SETTINGS.emailTemplates),
    defaults: safeParse(row.defaults, DEFAULT_SETTINGS.defaults),
    branding: safeParse(row.branding, DEFAULT_SETTINGS.branding),
    payment: {
      enabled: paymentRaw.enabled,
      secretKeySet: !!paymentRaw.secretKey,
      hmacSecretSet: !!paymentRaw.hmacSecret,
      integrationIds: paymentRaw.integrationIds,
      baseUrl: paymentRaw.baseUrl,
      publicKey: paymentRaw.publicKey,
      currency: paymentRaw.currency,
      marketplaceFeePct: paymentRaw.marketplaceFeePct,
    },
  };
}

function safeParse(str, fallback) {
  try { return JSON.parse(str || '{}'); } catch { return fallback; }
}

// ─── Router ────────────────────────────────────────────────────
export const adminSettingsRoutes = new Hono();

// GET /api/admin/settings — retrieve all platform settings
adminSettingsRoutes.get('/', async (c) => {
  const auth = await superSettingsGate(c.req.raw, c.env);
  if (auth instanceof Response) return auth;

  try {
    await ensureSettingsRow(c.env.DB);
    const row = await c.env.DB.prepare('SELECT * FROM platform_settings WHERE id = 1').first();
    return jsonResponse(parseSettingsRow(row));
  } catch (e) {
    return errorResponse('Failed to load settings');
  }
});

// PUT /api/admin/settings — update settings (partial merge)
adminSettingsRoutes.put('/', async (c) => {
  const auth = await superSettingsGate(c.req.raw, c.env);
  if (auth instanceof Response) return auth;

  try {
    await ensureSettingsRow(c.env.DB);
    const rawBody = await c.req.json();
    const body = toSnake(rawBody);
    const parsed = settingsUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse({ success: false, error: 'Invalid settings data', errors: parsed.error.issues }, 400);
    }

    const current = await c.env.DB.prepare('SELECT * FROM platform_settings WHERE id = 1').first();
    const currentSettings = parseSettingsRow(current);
    const updates = parsed.data;

    // Merge each section
    if (updates.feature_flags || updates.featureFlags) {
      currentSettings.featureFlags = { ...currentSettings.featureFlags, ...(updates.feature_flags || updates.featureFlags) };
    }
    if (updates.email_templates || updates.emailTemplates) {
      currentSettings.emailTemplates = { ...currentSettings.emailTemplates, ...(updates.email_templates || updates.emailTemplates) };
    }
    if (updates.defaults) {
      currentSettings.defaults = { ...currentSettings.defaults, ...updates.defaults };
    }
    if (updates.branding) {
      currentSettings.branding = { ...currentSettings.branding, ...updates.branding };
    }

    // Merge payment section — read raw secrets from DB (parseSettingsRow masks them)
    const currentPayment = safeParse(current?.payment, DEFAULT_SETTINGS.payment);
    const paymentRaw = rawBody.payment || rawBody.payment_config;
    if (paymentRaw && typeof paymentRaw === 'object') {
      const mergedPayment = { ...currentPayment };
      for (const [key, value] of Object.entries(paymentRaw)) {
        if ((key === 'secretKey' || key === 'secret_key') && value !== undefined) {
          mergedPayment.secretKey = value === '' ? '' : value;
        } else if ((key === 'hmacSecret' || key === 'hmac_secret') && value !== undefined) {
          mergedPayment.hmacSecret = value === '' ? '' : value;
        } else if (value !== undefined) {
          const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          mergedPayment[camelKey] = value;
        }
      }
      currentSettings.payment = mergedPayment;
    }

    await c.env.DB.prepare(
      `UPDATE platform_settings SET feature_flags = ?, email_templates = ?, defaults = ?, branding = ?, payment = ?, updated_at = datetime('now'), updated_by = ? WHERE id = 1`
    ).bind(
      JSON.stringify(currentSettings.featureFlags),
      JSON.stringify(currentSettings.emailTemplates),
      JSON.stringify(currentSettings.defaults),
      JSON.stringify(currentSettings.branding),
      JSON.stringify(currentSettings.payment),
      auth.user?.id || 'system',
    ).run();

    // Mask payment secrets before returning
    const maskedPayment = { ...currentSettings.payment };
    maskedPayment.secretKeySet = !!maskedPayment.secretKey;
    maskedPayment.hmacSecretSet = !!maskedPayment.hmacSecret;
    delete maskedPayment.secretKey;
    delete maskedPayment.hmacSecret;
    currentSettings.payment = maskedPayment;

    return jsonResponse({ success: true, ...currentSettings });
  } catch (e) {
    return errorResponse('Failed to update settings');
  }
});

// GET /api/admin/feature-flags — list all feature flags
adminSettingsRoutes.get('/feature-flags', async (c) => {
  const auth = await superSettingsGate(c.req.raw, c.env);
  if (auth instanceof Response) return auth;

  try {
    await ensureSettingsRow(c.env.DB);
    const row = await c.env.DB.prepare('SELECT feature_flags FROM platform_settings WHERE id = 1').first();
    const flags = safeParse(row?.feature_flags, DEFAULT_SETTINGS.featureFlags);
    const list = Object.entries(flags).map(([key, enabled]) => ({
      id: key,
      key,
      enabled: !!enabled,
      label: key.charAt(0).toUpperCase() + key.slice(1),
    }));
    return jsonResponse({ data: list, total: list.length });
  } catch (e) {
    return errorResponse('Failed to load feature flags');
  }
});

// PUT /api/admin/feature-flags/:id — toggle a feature flag
adminSettingsRoutes.put('/feature-flags/:id', async (c) => {
  const auth = await superSettingsGate(c.req.raw, c.env);
  if (auth instanceof Response) return auth;

  try {
    const flagId = c.req.param('id');
    const body = await c.req.json();
    const enabled = body?.enabled;
    if (typeof enabled !== 'boolean') {
      return jsonResponse({ success: false, error: 'enabled (boolean) is required' }, 400);
    }

    await ensureSettingsRow(c.env.DB);
    const row = await c.env.DB.prepare('SELECT feature_flags FROM platform_settings WHERE id = 1').first();
    const flags = safeParse(row?.feature_flags, DEFAULT_SETTINGS.featureFlags);
    flags[flagId] = enabled;

    await c.env.DB.prepare(
      `UPDATE platform_settings SET feature_flags = ?, updated_at = datetime('now'), updated_by = ? WHERE id = 1`
    ).bind(JSON.stringify(flags), auth.user?.id || 'system').run();

    return jsonResponse({ success: true, id: flagId, enabled });
  } catch (e) {
    return errorResponse('Failed to toggle feature flag');
  }
});

// Catch-all for unmatched routes within this module
adminSettingsRoutes.all('*', () => jsonResponse({ error: 'Method not allowed' }, 405));

export default adminSettingsRoutes;
