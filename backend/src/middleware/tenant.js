/**
 * Tenant resolution middleware — looks up tenant by query param, header, or hostname.
 */

export async function getTenant(request, env) {
  const url = new URL(request.url);

  const queryTenant = url.searchParams.get('tenant_id');
  const headerTenant = request.headers.get('x-tenant-id');
  const host = url.hostname;

  let lookupKey = queryTenant || headerTenant || host;
  if (!lookupKey) return null;

  lookupKey = lookupKey.replace(/^www\./i, '');

  if (lookupKey === 'localhost' || lookupKey === '127.0.0.1' || lookupKey === '127') {
    return null;
  }

  // P-H5 fix: Remove leading-wildcard LIKE — use exact match only
  // H5 fix: only ACTIVE tenants resolve here, so suspended/pending tenants
  // stop serving public traffic and tenant-scoped API resolution. Status is a
  // fixed enum inlined as a literal (not user input) to keep the bind count at
  // exactly [key, key, key].
  const { results } = await env.DB.prepare(
    "SELECT id FROM tenants WHERE (id = ? OR subdomain = ? OR custom_domain = ?) AND status = 'active'"
  ).bind(lookupKey, lookupKey, lookupKey).all();

  if (results.length > 0) {
    return results[0].id;
  }

  return null;
}
