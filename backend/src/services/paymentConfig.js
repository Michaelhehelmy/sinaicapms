/**
 * Runtime Paymob config loader.
 *
 * Reads the dashboard-stored `platform_settings.payment` blob FIRST,
 * then fills gaps from `env.PM_*` vars/secrets.  Designed so tests
 * (which have no platform_settings table) fall back to env seamlessly.
 *
 * NEVER throws — callers always get a usable config object.
 */

/**
 * @param {object} env - Hono context env (env.DB, env.PM_*, etc.)
 * @returns {Promise<{
 *   enabled: boolean,
 *   secretKey: string,
 *   hmacSecret: string,
 *   integrationIds: number[],
 *   baseUrl: string,
 *   publicKey: string,
 *   currency: string,
 *   marketplaceFeePct: number
 * }>}
 */
export async function loadPaymentConfig(env) {
  let blob = {};

  try {
    const row = await env.DB.prepare(
      'SELECT payment FROM platform_settings WHERE id = 1'
    ).first();
    if (row && row.payment) {
      try {
        blob = JSON.parse(row.payment);
      } catch {
        blob = {};
      }
    }
  } catch {
    // Table may not exist (tests) or DB error — fall through to env.
  }

  const enabled = typeof blob.enabled === 'boolean'
    ? blob.enabled
    : env.PM_ENABLED === 'true';

  const secretKey = blob.secretKey || env.PM_SECRET_KEY || '';
  const hmacSecret = blob.hmacSecret || env.PM_HMAC_SECRET || '';
  const baseUrl = blob.baseUrl || env.PM_BASE_URL || 'https://accept.paymob.com';
  const publicKey = blob.publicKey || env.PM_PUBLIC_KEY || '';
  const currency = blob.currency || env.PM_CURRENCY || 'EGP';
  const marketplaceFeePct = typeof blob.marketplaceFeePct === 'number'
    ? blob.marketplaceFeePct
    : 0;

  let integrationIds = [];
  const rawIds = blob.integrationIds ?? env.PM_INTEGRATION_IDS;
  if (typeof rawIds === 'string') {
    integrationIds = rawIds.split(',').map(Number).filter(n => !Number.isNaN(n));
  } else if (Array.isArray(rawIds)) {
    integrationIds = rawIds.map(Number).filter(n => !Number.isNaN(n));
  }

  return { enabled, secretKey, hmacSecret, integrationIds, baseUrl, publicKey, currency, marketplaceFeePct };
}
