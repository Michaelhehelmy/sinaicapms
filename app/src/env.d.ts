/// <reference path="../.astro/types.d.ts" />

import type { Locale } from '@/i18n';

declare global {
  namespace App {
    interface Locals {
      tenantId: string;
      API_BASE: string;
      /**
       * Binding-aware SSR API fetcher injected by the tenant middleware.
       * Resolves `(path) => env.API_BACKEND.fetch('/api' + path)` on Pages
       * production (service binding) or falls back to a plain cross-origin
       * `fetch(API_BASE + path)` when the binding is absent (local dev /
       * preview / tests).
       */
      API_FETCH?: (path: string, init?: RequestInit) => Promise<Response>;
      tenant: Record<string, unknown> | null;
      tenantSubdomain: string;
      /**
       * Content zone for the request: 'marketplace' (sinaicamps.com / localhost
       * without `?tenant=`) or 'tenant' (subdomain / custom domain / localhost
       * with `?tenant=`). Set by the tenant middleware via lib/routeZones.ts.
       */
      zone: 'marketplace' | 'tenant';
      /**
       * True when the current route is not owned by the resolved zone (see
       * lib/routeZones.ts isRouteForbidden). Restricted pages must render the
       * branded 404 when set.
       */
      routeForbidden: boolean;
      /**
       * Per-request locale (default 'en'), set by the middleware chain. SSR
       * i18n consumers must read this (or pass an explicit locale) instead of
       * relying on module-level state — there is none.
       */
      locale: Locale;
      /**
       * Adapter-injected Cloudflare runtime (advanced mode). Set by
       * `@astrojs/cloudflare` — `env` carries the Worker/Pages bindings,
       * including the `API_BACKEND` service binding.
       */
      runtime?: {
        waitUntil?: (promise: Promise<unknown>) => void;
        env?: Record<string, unknown>;
        cf?: unknown;
        caches?: unknown;
      };
    }
  }
}

export {};
