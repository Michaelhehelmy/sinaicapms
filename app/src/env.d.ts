/// <reference path="../.astro/types.d.ts" />

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
       * Outcome of the middleware's tenant lookup (see lib/tenantLookup.ts):
       * 'skipped' (no lookup — marketplace host / system route), 'ok',
       * 'not-found' (the API positively answered "no such tenant" — the ONLY
       * state that may render the branded 404) or 'failed' (the lookup could
       * not be completed — renders the 503 outage page instead). 'skipped' is
       * the default so a request that never ran the lookup can never be
       * mistaken for a positive "no such tenant".
       */
      tenantLookupState: 'skipped' | 'ok' | 'not-found' | 'failed';
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

  /**
   * Client-visible env (`import.meta.env.PUBLIC_*`, baked at build time).
   * - `PUBLIC_REPORT_TOKEN`: write-only campmaster-monitor intake token for
   *   `app/src/lib/reporter.ts` (POST /report/error + /report/feedback).
   *   Absent ⇒ reporter is a silent no-op. Safe to expose: it can only APPEND
   *   reports (60/min per-IP throttle). NEVER add `DASHBOARD_TOKEN` here.
   * - `PUBLIC_REPORT_URL`: optional monitor-origin override (staging/local
   *   monitor). Defaults to `https://status.sinaicamps.com` when blank.
   */
  interface ImportMetaEnv {
    readonly PUBLIC_REPORT_TOKEN?: string;
    readonly PUBLIC_REPORT_URL?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export {};
