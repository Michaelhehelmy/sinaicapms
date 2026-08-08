import { createContext, useCallback, useMemo, useState, type ReactNode } from 'react';
import en from './en.json';
import ar from './ar.json';

export type TranslationKeys = typeof en;

export const SUPPORTED_LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export type Direction = 'ltr' | 'rtl';

export type TranslateParams = Record<string, string | number>;

interface NestedDictionary {
  [key: string]: string | NestedDictionary;
}

const locales: Record<Locale, NestedDictionary> = { en, ar };

// ── Pure lookup (no module state — safe in SSR and per-request) ─────────────

function lookup(key: string, locale: Locale): string | undefined {
  let node: NestedDictionary | string = locales[locale];
  for (const part of key.split('.')) {
    if (typeof node === 'string') return undefined;
    if (!Object.prototype.hasOwnProperty.call(node, part)) return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(template: string, params: TranslateParams): string {
  return Object.entries(params).reduce(
    (result, [paramKey, value]) =>
      result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(value)),
    template
  );
}

// ── Browser-side compatibility shim ─────────────────────────────────────────
// The legacy `setLocale`/`getLocale` API is kept ONLY for client code and
// tests. Locale state lives on `window` (never module scope) and every helper
// is a no-op/fallback outside the browser, so SSR requests can never read or
// mutate a shared module singleton. SSR/server code should use
// `createI18n(Astro.locals.locale)` or `t(key, params, locale)` instead.

const BROWSER_LOCALE_KEY = '__sc_i18n_locale__';

interface BrowserLocaleWindow extends Window {
  [BROWSER_LOCALE_KEY]?: unknown;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function readBrowserLocale(): Locale {
  if (!isBrowser()) return DEFAULT_LOCALE;
  const stored = (window as BrowserLocaleWindow)[BROWSER_LOCALE_KEY];
  return stored === 'en' || stored === 'ar' ? stored : DEFAULT_LOCALE;
}

function writeBrowserLocale(locale: Locale): void {
  if (!isBrowser()) return;
  (window as BrowserLocaleWindow)[BROWSER_LOCALE_KEY] = locale;
}

export function setLocale(locale: Locale): void {
  writeBrowserLocale(locale);
}

export function getLocale(): Locale {
  return readBrowserLocale();
}

// ── Public translation API ───────────────────────────────────────────────────

/**
 * Translate `key` (dot-separated, e.g. `common.save`).
 *
 * Pass an explicit `locale` in SSR/server contexts (e.g.
 * `t('nav.home', undefined, Astro.locals.locale)`) for fully stateless,
 * per-request resolution. Without a locale argument it resolves against the
 * browser shim in the client and defaults to `'en'` on the server.
 */
export function t(key: string, params?: TranslateParams, locale?: Locale): string {
  const activeLocale = locale ?? getLocale();
  const resolved = lookup(key, activeLocale);
  if (typeof resolved !== 'string') return key;
  return params ? interpolate(resolved, params) : resolved;
}

/** True when the (resolved) locale is Arabic. */
export function isRTL(locale?: Locale): boolean {
  return (locale ?? getLocale()) === 'ar';
}

/** Document direction for the (resolved) locale. */
export function getDirection(locale?: Locale): Direction {
  return (locale ?? getLocale()) === 'ar' ? 'rtl' : 'ltr';
}

// ── Pure per-locale factory (recommended for SSR) ───────────────────────────

export interface I18n {
  locale: Locale;
  t: (key: string, params?: TranslateParams) => string;
  isRTL: boolean;
  direction: Direction;
  getDirection: () => Direction;
}

/**
 * Factory for a pure, stateless i18n instance bound to one locale. This is the
 * recommended API for SSR/server contexts: `createI18n(Astro.locals.locale)`
 * gives every request its own instance with zero shared state.
 */
export function createI18n(locale: Locale = DEFAULT_LOCALE): I18n {
  return {
    locale,
    t: (key, params) => t(key, params, locale),
    isRTL: locale === 'ar',
    direction: locale === 'ar' ? 'rtl' : 'ltr',
    getDirection: () => (locale === 'ar' ? 'rtl' : 'ltr'),
  };
}

// ── React context for client components ─────────────────────────────────────

export interface I18nContextValue {
  locale: Locale;
  changeLocale: (locale: Locale) => void;
}

/**
 * Default context value. It also acts as a sentinel: `useContext(I18nContext)`
 * returns this exact reference while no `I18nProvider` is mounted, letting
 * consumers detect provider presence by reference identity.
 */
export const DEFAULT_I18N_CONTEXT_VALUE: I18nContextValue = {
  locale: DEFAULT_LOCALE,
  changeLocale: () => {},
};

export const I18nContext = createContext<I18nContextValue>(DEFAULT_I18N_CONTEXT_VALUE);

export interface I18nProviderProps {
  /** Initial locale for the subtree. Defaults to 'en'. */
  locale?: Locale;
  children: ReactNode;
}

/**
 * React context provider for locale state in client components. Wrap islands
 * with it to share locale state; consumers can use `useI18n()` (preferred) or
 * read/write `I18nContext` directly. The provider itself only manages state —
 * DOM `dir`/`lang` syncing lives in `useI18n#changeLocale`.
 */
export function I18nProvider({ locale = DEFAULT_LOCALE, children }: I18nProviderProps) {
  const [activeLocale, setActiveLocale] = useState<Locale>(locale);
  const changeLocale = useCallback((next: Locale) => {
    setActiveLocale(next);
  }, []);
  const value = useMemo(
    () => ({ locale: activeLocale, changeLocale }),
    [activeLocale, changeLocale]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
