import type { APIRequestContext, Page } from '@playwright/test';

export const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8787';

export const SUPER_ADMIN = {
  email: 'admin@sinaicamps.com',
  password: process.env.SUPER_ADMIN_PASSCODE || 'sinairoot',
  tenantId: 'marketplace',
};

export const TEST_TENANT = {
  id: process.env.E2E_TENANT_ID || 'acaciacamp',
  subdomain: process.env.E2E_TENANT_SUBDOMAIN || 'acacia',
  name: 'Acacia Camp',
};

export const TEST_TENANT_ADMIN = {
  email: 'e2e-admin@test.com',
  password: 'TestPass123!',
};

export const TEST_PRODUCT = {
  name: 'E2E Test Product',
  capacity: 2,
  basePrice: 80,
  description: 'E2E test room type',
};

export const TEST_CUSTOMER = {
  firstName: 'E2E',
  lastName: 'Customer',
  email: 'e2e-customer@test.com',
  phone: '+201001234567',
};

export const TEST_CAMPS = [
  { id: process.env.E2E_TENANT_ID || 'acaciacamp', name: 'Acacia Camp', location: 'Sinai Peninsula, Egypt', capacity: 80 },
  { id: process.env.E2E_TENANT_2_ID || 'michaelshouse', name: "Michael's House", location: 'Dahab, South Sinai', capacity: 50 },
];

export const TEST_PRODUCTS = [
  { id: 'e2e-rt-1', name: 'Standard Tent', capacity: 2, basePrice: 80 },
  { id: 'e2e-rt-2', name: 'Deluxe Cabin', capacity: 4, basePrice: 150 },
];

export const TEST_RATE_PLAN = {
  id: 'e2e-rp-1',
  name: 'Summer Season Rate',
  productId: 'e2e-rt-1',
  pricePerNight: 80,
  startDate: '2026-07-01',
  endDate: '2026-09-30',
};

export const TEST_MEAL_CATEGORIES = [
  { name: 'Main Courses', position: 1 },
  { name: 'Drinks', position: 2 },
];

export const TEST_MEALS = [
  { name: 'Grilled Chicken', price: 150, description: 'Delicious grilled chicken', catIndex: 0 },
  { name: 'Pasta Carbonara', price: 120, description: 'Classic Italian pasta', catIndex: 0 },
  { name: 'Fresh Orange Juice', price: 30, description: 'Freshly squeezed', catIndex: 1 },
  { name: 'Iced Tea', price: 25, description: 'Refreshing cold tea', catIndex: 1 },
];

export const TEST_POS_USER = {
  identifier: process.env.POS_IDENTIFIER || 'cashier',
  // NOTE: must be 8+ chars — POST /api/pos-users enforces min(8) on create.
  password: process.env.POS_PASSWORD || 'pass1234',
};

export const TENANT_URL = (path: string, tenantId?: string) =>
  tenantId ? `${path}?tenant=${tenantId}` : path;

/**
 * Resolve the production tenant-portal origin (custom domain) for a tenant id.
 *
 * - Local dev: the Astro dev server (baseURL localhost:4320) does not serve
 *   `/api/tenants`, so this returns null and callers fall back to the dev-only
 *   `?tenant=` convention (unchanged behavior).
 * - Production: tenant-zone routes (`/`, `/rooms`, `/about`, `/contact`,
 *   `/faq`, `/gallery`) live on the tenant's custom domain (e.g.
 *   https://acaciacamp.com). The marketplace root IGNORES `?tenant=` and
 *   returns a branded 404 for tenant-only routes like `/rooms`, so the portal
 *   origin must be discovered from the public API and used directly.
 */
export async function resolvePortalOrigin(
  request: APIRequestContext,
  tenantId?: string
): Promise<string | null> {
  if (!tenantId) return null;
  try {
    const res = await request.get('/api/tenants');
    if (!res.ok()) return null;
    const body = await res.json();
    const tenants = Array.isArray(body) ? body : [];
    const tenant = tenants.find((t) => t && t.id === tenantId);
    const domain = tenant && (tenant.custom_domain || tenant.customDomain);
    return domain ? `https://${domain}` : null;
  } catch {
    return null;
  }
}

/**
 * Build the URL for a tenant-zone path. On production this is the tenant
 * portal origin (custom domain); in local dev it is the `?tenant=` convention.
 * Uses `page.request` so it works from page objects and raw specs alike.
 */
export async function tenantUrl(
  page: Page,
  tenantId: string,
  path: string
): Promise<string> {
  const portal = await resolvePortalOrigin(page.request, tenantId);
  if (portal) return `${portal}${path}`;
  return tenantId ? `${path}?tenant=${tenantId}` : path;
}
