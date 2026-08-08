import { useCallback, useContext, useMemo, useState } from 'react';
import {
  createI18n,
  getDirection,
  DEFAULT_I18N_CONTEXT_VALUE,
  DEFAULT_LOCALE,
  I18nContext,
  setLocale,
  type Locale,
} from '@/i18n';

/**
 * React hook exposing the current locale plus a bound translation function.
 *
 * The locale is read from React context when an `I18nProvider` is mounted and
 * falls back to hook-local state otherwise (standalone islands, tests). There
 * is intentionally NO module-level locale singleton — server code must use
 * `createI18n(locale)` or `t(key, params, locale)` with the per-request locale
 * from `Astro.locals.locale`.
 */
export function useI18n() {
  const context = useContext(I18nContext);
  const hasProvider = context !== DEFAULT_I18N_CONTEXT_VALUE;

  const [localLocale, setLocalLocale] = useState<Locale>(DEFAULT_LOCALE);
  const locale = hasProvider ? context.locale : localLocale;

  const changeLocale = useCallback(
    (next: Locale) => {
      if (hasProvider) {
        context.changeLocale(next);
      } else {
        setLocalLocale(next);
      }
      // Keep the browser-side compat shim in sync so `getLocale()` matches the
      // active UI locale (no-op outside the browser).
      setLocale(next);
      document.documentElement.dir = getDirection(next);
      document.documentElement.lang = next;
    },
    [context, hasProvider]
  );

  const { t, isRTL, direction } = useMemo(() => createI18n(locale), [locale]);

  return {
    t,
    locale,
    isRTL,
    direction,
    changeLocale,
  };
}
