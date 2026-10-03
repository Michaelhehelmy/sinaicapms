import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  classifyTenantLookup,
  resolveTenantGuardState,
  TENANT_NOT_FOUND_STATUS,
  TENANT_OUTAGE_HEADLINE,
  TENANT_OUTAGE_MARKER,
  TENANT_OUTAGE_RETRY_AFTER,
  TENANT_OUTAGE_RETRY_LABEL,
  TENANT_OUTAGE_STATUS,
} from '@/lib/tenantLookup';

/**
 * Regression cover for the 2026-10-03 D1 outage: a tenant host answered with
 * the branded 404 because the middleware could not tell "tenant lookup failed"
 * from "no such tenant". The classification is pure and lives in ONE module;
 * these cases pin every branch of it, then the wiring cases pin that the guard
 * actually renders the outage document for it (vitest cannot render .astro, so
 * the render site is asserted on source — the same technique
 * tests/unit/reporter-wiring.test.tsx uses for layouts).
 */

describe('classifyTenantLookup — absence vs failure', () => {
  it('resolves a 2xx carrying an id', () => {
    expect(classifyTenantLookup({ ok: true, status: 200 }, { id: 'acacia' })).toBe('ok');
  });

  it('treats a 404 (and 410) as a positive "no such tenant"', () => {
    expect(classifyTenantLookup({ ok: false, status: 404 })).toBe('not-found');
    expect(classifyTenantLookup({ ok: false, status: 410 })).toBe('not-found');
  });

  it('treats a 2xx we cannot use as absent (pre-existing behaviour)', () => {
    expect(classifyTenantLookup({ ok: true, status: 200 }, null)).toBe('not-found');
    expect(classifyTenantLookup({ ok: true, status: 200 }, {})).toBe('not-found');
    expect(classifyTenantLookup({ ok: true, status: 200 }, { id: '' })).toBe('not-found');
  });

  it('treats a D1 outage (5xx) as failed, not as absence', () => {
    for (const status of [500, 502, 503, 504]) {
      expect(classifyTenantLookup({ ok: false, status })).toBe('failed');
    }
  });

  it('treats throttling, auth errors and junk answers as failed', () => {
    for (const status of [401, 403, 429]) {
      expect(classifyTenantLookup({ ok: false, status })).toBe('failed');
    }
    // A response with no status at all proves nothing either way.
    expect(classifyTenantLookup({ ok: false })).toBe('failed');
    expect(classifyTenantLookup(null)).toBe('failed');
    expect(classifyTenantLookup(undefined)).toBe('failed');
  });
});

describe('resolveTenantGuardState — what the guard serves', () => {
  it('serves the outage page with 503 + Retry-After when the lookup failed', () => {
    const guard = resolveTenantGuardState({ tenantLookupState: 'failed', routeForbidden: false });

    expect(guard.kind).toBe('outage');
    expect(guard.status).toBe(TENANT_OUTAGE_STATUS);
    expect(guard.status).toBe(503);
    expect(guard.status).not.toBe(404);
    // Asserted as the literal, not against the import: the guard only sets the
    // header when this value is truthy, so an emptied constant would silently
    // drop `Retry-After` and still satisfy a self-referential assertion.
    expect(guard.retryAfter).toBe('60');
    expect(TENANT_OUTAGE_RETRY_AFTER).toBe('60');
  });

  it('keeps the branded 404 when the API positively said "no such tenant"', () => {
    for (const routeForbidden of [false, true]) {
      const guard = resolveTenantGuardState({ tenantLookupState: 'not-found', routeForbidden });
      expect(guard.kind).toBe('not-found');
      expect(guard.status).toBe(404);
      expect(guard.retryAfter).toBeNull();
    }
  });

  it('keeps the branded 404 on the healthy path and when no lookup ran', () => {
    for (const tenantLookupState of ['ok', 'skipped'] as const) {
      const guard = resolveTenantGuardState({ tenantLookupState, routeForbidden: false });
      expect(guard.kind).toBe('not-found');
      expect(guard.status).toBe(404);
    }
  });

  it('never lets an outage loosen zone exclusivity', () => {
    // A zone-forbidden route is a REAL 404 whatever D1 is doing, so the outage
    // state must not turn `/camps` on a tenant host into a 503.
    const guard = resolveTenantGuardState({ tenantLookupState: 'failed', routeForbidden: true });

    expect(guard.kind).toBe('not-found');
    expect(guard.status).toBe(404);
    expect(guard.retryAfter).toBeNull();
  });

  it('falls back to the branded 404 when the locals are absent', () => {
    // A render that never ran the middleware (prerendered / preview) must keep
    // today's behaviour instead of throwing or claiming an outage.
    for (const input of [{}, { tenantLookupState: undefined }, { routeForbidden: undefined }]) {
      const guard = resolveTenantGuardState(input);
      expect(guard.kind).toBe('not-found');
      expect(guard.status).toBe(TENANT_NOT_FOUND_STATUS);
    }
  });
});

describe('guard wiring — one decision, one render site', () => {
  const read = (rel: string) =>
    readFileSync(join(process.cwd(), 'src', rel), 'utf8');

  it('ZoneGuard decides from the middleware locals and sets the status', () => {
    const src = read('components/public/ZoneGuard.astro');

    expect(src).toContain('resolveTenantGuardState');
    expect(src).toContain('Astro.locals.tenantLookupState');
    expect(src).toContain('Astro.locals.routeForbidden');
    expect(src).toContain('Astro.response.status = guard.status');
    // The retry hint is part of the 503 contract, not decoration.
    expect(src).toContain("Astro.response.headers.set('Retry-After', guard.retryAfter)");
  });

  it('ZoneGuard renders the outage document only for the outage kind', () => {
    const src = read('components/public/ZoneGuard.astro');

    expect(src).toContain("guard.kind === 'outage' ? <TenantOutagePage />");
    expect(src).toContain('<NotFoundPage />');
  });

  it('the outage page carries the rendered marker, copy and retry affordance', () => {
    const src = read('components/public/TenantOutagePage.astro');

    expect(src).toContain('data-testid={TENANT_OUTAGE_MARKER}');
    expect(src).toContain('{TENANT_OUTAGE_HEADLINE}');
    expect(src).toContain('{TENANT_OUTAGE_RETRY_LABEL}');
    // Retry re-requests THIS path (+ query), so `?tenant=` survives it.
    expect(src).toContain('${Astro.url.pathname}${Astro.url.search}');
    expect(TENANT_OUTAGE_MARKER).not.toBe('not-found-page');
    expect(TENANT_OUTAGE_HEADLINE).toBe("We're having trouble loading this property");
  });

  it('the outage page never shows 404 branding (it is a 503 document)', () => {
    const src = read('components/public/TenantOutagePage.astro');

    expect(src).not.toContain('not-found-page');
    expect(src).not.toContain('not-found-code');
    expect(src).not.toContain('404');
    expect(src).toContain('503');
  });

  it('the middleware publishes the state and the typed local exists', () => {
    const middleware = read('middleware/tenant.ts');
    const env = read('env.d.ts');

    // Published once, in both resolution paths (SSR data + locals).
    expect(middleware).toContain('context.locals.tenantLookupState = classifyTenantLookup');
    expect(middleware).toContain("context.locals.tenantLookupState = 'failed'");
    expect(middleware).toContain("context.locals.tenantLookupState = 'skipped'");
    expect(env).toContain("tenantLookupState: 'skipped' | 'ok' | 'not-found' | 'failed'");
  });

  it('pages that render ZoneGuard for a missing tenant keep using it', () => {
    // The distinction is made once; these pages must NOT grow a second copy of
    // it (a per-page `!tenant ? 404 : …` would bypass the outage state).
    const pages = [
      'components/public/TenantLanding.astro',
      'pages/book.astro',
      'pages/menu.astro',
      'pages/rooms.astro',
      'pages/camp/[id]/book.astro',
      'pages/camp/[id]/menu.astro',
      'pages/storefront/index.astro',
    ];
    for (const page of pages) {
      expect(read(page), page).toContain('<ZoneGuard />');
    }
  });
});
