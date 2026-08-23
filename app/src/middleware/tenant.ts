import type { MiddlewareHandler } from 'astro';
import { defineMiddleware } from 'astro:middleware';
import { isRouteForbidden, resolveZone } from '@/lib/routeZones';
import { buildTenantTheme, type TenantTheme } from '@/lib/theme';

export interface TenantData {
  id: string;
  name: string;
  subdomain: string;
  primaryColor?: string;
  logoUrl?: string;
  faviconUrl?: string;
  description?: string;
  location?: string;
  phone?: string;
  email?: string;
  whatsappNumber?: string;
  heroImageUrl?: string;
  aboutText?: string;
  activities?: string;
  customDomain?: string;
  galleryImages?: string;
  faqItems?: string;
  reviews?: string;
  mapEmbedUrl?: string;
  footerText?: string;
  capacity?: number;
  hasMeals?: number;
  menuConfig?: string;
  currency?: string;
}

export interface TenantSSRData {
  tenant: TenantData | null;
  camps: TenantData[];
  roomTypes: RoomTypeData[];
  tenantId: string;
  primaryColor: string;
  tenantName: string;
  API_BASE: string;
  theme: TenantTheme;
}

export interface RoomTypeData {
  id: string | number;
  name: string;
  description?: string;
  basePrice?: number;
  capacity?: number;
  imageUrl?: string;
  campIds?: (string | number)[];
  isActive?: number;
  categoryId?: string;
}

export type ApiFetcher = (path: string, init?: RequestInit) => Promise<Response>;

interface ApiBackendBinding {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

/**
 * Binding-aware SSR API fetcher factory.
 *
 * On Cloudflare Pages production the backend Worker (`campmaster-backend`)
 * is reached through a service binding named `API_BACKEND`. Same-zone
 * `fetch()` to `https://sinaicamps.com/api/*` is rejected by Cloudflare with
 * error 1042 on the root host, so SSR must call the binding instead. The
 * binding's hostname is arbitrary (the service is selected by the binding);
 * the path must keep the backend's versioned `/api/v1` prefix (Phase 9) —
 * the worker entrypoint rewrites it back to `/api/*` before dispatch.
 *
 * Falls back to a plain cross-origin `fetch(\`${apiBase}${path}\`)` when the
 * binding is absent (local dev / preview / tests) — there the cross-origin
 * request routes to the backend Worker correctly.
 */
export function resolveApiFetcher(
  runtimeEnv: Record<string, unknown> | undefined,
  apiBase: string,
): ApiFetcher {
  const binding = runtimeEnv?.API_BACKEND as ApiBackendBinding | undefined;
  if (binding && typeof binding?.fetch === 'function') {
    return (path, init) => binding.fetch(new URL(`/api/v1${path}`, 'https://campmaster-backend/'), init);
  }
  return (path, init) => {
    const url = `${apiBase}${path}`;
    return init === undefined ? fetch(url) : fetch(url, init);
  };
}

function resolveTenantId(url: URL): string {
  const hostname = url.hostname;

  // Marketplace
  if (
    hostname === 'sinaicamps.com' ||
    hostname === 'www.sinaicamps.com'
  ) {
    return 'marketplace';
  }

  // Localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const paramTenant = url.searchParams.get('tenant');
    if (paramTenant) return paramTenant;
    return '';
  }

  // Subdomain of sinaicamps.com → extract subdomain
  if (hostname.endsWith('.sinaicamps.com')) {
    const subdomain = hostname.split('.')[0];
    if (subdomain && subdomain !== 'www') return subdomain;
  }

  // Custom domain (acaciacamp.com, www.acaciacamp.com, etc.) → return the
  // hostname as the lookup key, with a leading `www.` stripped so the
  // backend custom_domain match works. The backend /api/tenants/:id
  // supports custom_domain lookup.
  const host = hostname.replace(/^www\./, '');
  return host;
}

function getApiBase(url: URL): string {
  const isLocal =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname.endsWith('.localhost') ||
    url.hostname.endsWith('.127.0.0.1');
  if (isLocal) return 'http://localhost:8787/api/v1';
  const isSinaicamps = url.hostname === 'sinaicamps.com' || url.hostname.endsWith('.sinaicamps.com');
  return isSinaicamps ? `${url.origin}/api/v1` : `https://sinaicamps.com/api/v1`;
}

export async function getTenantSSRData(url: URL, fetcher?: ApiFetcher): Promise<TenantSSRData> {
  const API_BASE = getApiBase(url);
  const apiFetch = fetcher ?? resolveApiFetcher(undefined, API_BASE);
  const lookupKey = resolveTenantId(url);

  let tenant: TenantData | null = null;
  let camps: TenantData[] = [];
  let roomTypes: RoomTypeData[] = [];
  let tenantId = '';

  if (!lookupKey) {
    return {
      tenant,
      camps,
      roomTypes,
      tenantId,
      primaryColor: '#4a7c4f',
      tenantName: 'Camp Portal',
      API_BASE,
      theme: buildTenantTheme(null),
    };
  }

  try {
    // Try single-tenant lookup first (supports id, subdomain, custom_domain)
    const singleRes = await apiFetch(`/tenants/${lookupKey}`);
    if (singleRes.ok) {
      const matched = (await singleRes.json()) as TenantData;
      if (matched && matched.id) {
        tenantId = matched.id;
        tenant = matched;
        const headers = { 'x-tenant-id': tenantId };
        const [campsRes, productsRes] = await Promise.all([
          apiFetch(`/camps`, { headers }),
          apiFetch(`/products`, { headers }),
        ]);
        if (campsRes.ok) camps = await campsRes.json() as TenantData[];
        if (productsRes.ok) roomTypes = await productsRes.json() as RoomTypeData[];
      }
    }
  } catch (e) {
    console.error('Error loading tenant SSR data:', e);
  }

  return {
    tenant,
    camps,
    roomTypes,
    tenantId,
    primaryColor: tenant?.primaryColor || '#4a7c4f',
    tenantName: tenant?.name || 'Camp Portal',
    API_BASE,
    theme: buildTenantTheme(tenant),
  };
}

export const onRequest: MiddlewareHandler = defineMiddleware(async (context, next) => {
  const url = context.url;
  const API_BASE = getApiBase(url);
  const tenantId = resolveTenantId(url);

  // SSR API fetcher: uses the `API_BACKEND` service binding when available
  // (Pages production), falling back to a plain cross-origin fetch otherwise.
  const runtimeEnv = context.locals.runtime?.env as Record<string, unknown> | undefined;
  const apiFetch = resolveApiFetcher(runtimeEnv, API_BASE);

  const resolvedTenantId = tenantId || '';
  context.locals.tenantId = resolvedTenantId;
  context.locals.API_BASE = API_BASE;
  context.locals.API_FETCH = apiFetch;
  context.locals.tenant = null;
  context.locals.tenantSubdomain = '';

  const pathname = url.pathname;

  // Zone model: marketplace vs tenant route exclusivity (see lib/routeZones.ts).
  // Set for every request — admin/pos/auth pages are never forbidden because
  // isRouteForbidden() exempts system prefixes.
  context.locals.zone = resolveZone(url, resolvedTenantId);
  context.locals.routeForbidden = isRouteForbidden(context.locals.zone, pathname);

  // Skip SSR tenant resolution for admin, pos, and auth routes —
  // these are standalone SPAs that handle their own auth/data fetching
  // and do not use context.locals.tenant. Skipping avoids an unnecessary
  // cross-origin API fetch that can hang or fail on custom domains,
  // causing Cloudflare Pages to return 503.
  if (
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/pos' ||
    pathname.startsWith('/pos/') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/register')
  ) {
    return next();
  }

  if (resolvedTenantId && resolvedTenantId !== 'marketplace') {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await apiFetch(`/tenants/${resolvedTenantId}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const matched = (await res.json()) as TenantData;
        if (matched && matched.id) {
          context.locals.tenant = matched as unknown as Record<string, unknown>;
          context.locals.tenantId = matched.id;
          context.locals.tenantSubdomain = matched.subdomain || '';
        }
      }
    } catch (e) {
      console.error('Middleware tenant fetch failed:', e);
    }
  }

  return next();
});
