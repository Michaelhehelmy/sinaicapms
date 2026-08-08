import { sequence } from 'astro:middleware';
import type { MiddlewareHandler } from 'astro';
import { onRequest as tenantOnRequest } from './tenant';
import { onRequest as securityHeadersOnRequest } from './securityHeaders';
import type { Locale } from '@/i18n';

/**
 * Per-request locale resolution. The value is read from the `sc_lang` cookie
 * (set by the language toggles) and defaults to 'en'. SSR i18n consumers MUST
 * read `Astro.locals.locale` (or pass an explicit locale) instead of relying
 * on any module-level state — there is none.
 */
const setLocaleLocals: MiddlewareHandler = async (context, next) => {
  const requested = context.cookies.get('sc_lang')?.value;
  context.locals.locale = requested === 'ar' ? ('ar' as Locale) : ('en' as Locale);
  return next();
};

// Chain order: securityHeaders runs FIRST (outer), so it can set headers on
// the response produced by the inner chain (locale → tenant resolution → page
// render). Locale is resolved before the tenant so every downstream SSR fetch
// can use it.
export const onRequest = sequence(securityHeadersOnRequest, setLocaleLocals, tenantOnRequest);
