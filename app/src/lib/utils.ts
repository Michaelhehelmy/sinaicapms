import { hexToRgb, luminance } from '@/lib/theme';

export function escHtml(str: string): string {
  if (typeof str !== 'string') return String(str ?? '');
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (c) => map[c]);
}

/**
 * Normalizes a user-supplied asset URL (logo, favicon, hero image, room/product
 * image, etc.) before it reaches an HTML `src`/`href`/meta attribute.
 *
 * Guards the production site against bad DB values such as
 * `http://localhost:8001/...` or `http://127.0.0.1:8000/...` that would
 * otherwise leak into rendered markup:
 *
 * - null / empty / whitespace / non-string → `fallback` (`''` by default)
 * - unparseable strings and non-http(s) protocols (e.g. `javascript:`, `data:`) → `fallback`
 * - local/loopback hostnames (localhost, 127.*, 0.0.0.0, *.localhost, 10.*,
 *   192.168.*, ::1) → `fallback`
 * - plain `http://` URLs → upgraded to `https://` (production is always https),
 *   keeping host/path/port
 * - valid `https://` URLs → returned unchanged
 */
export function normalizeAssetUrl(
  url: string | null | undefined,
  fallback?: string,
): string {
  const safeFallback = fallback ?? '';
  if (url == null || typeof url !== 'string') return safeFallback;
  const trimmed = url.trim();
  if (trimmed === '') return safeFallback;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return safeFallback;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return safeFallback;
  }

  // URL.hostname keeps IPv6 brackets (e.g. "[::1]") — strip them for matching.
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isLocalHostname =
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '::' ||
    host.endsWith('.localhost') ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.');

  if (isLocalHostname) return safeFallback;

  if (parsed.protocol === 'http:') {
    parsed.protocol = 'https:';
  }

  return parsed.toString();
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount ?? 0);
}

export function formatDate(
  date: string | number | Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  }).format(d);
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, ms);
  };
}

export function truncate(str: string, len: number): string {
  if (!str || str.length <= len) return str ?? '';
  return str.slice(0, len) + '…';
}

/**
 * WCAG relative-luminance breakpoint for picking readable foreground text on a
 * tenant-supplied background color (0 = black, 1 = white). ~0.55 is a stricter,
 * "white unless clearly light" policy than WCAG's 0.179 crossover (see
 * `theme.CONTRAST_THRESHOLD`), tuned for brand CTAs on user-supplied colors.
 */
export const READABLE_TEXT_THRESHOLD = 0.55;

/** Design-token ink — matches `--color-ink: #22301f` in `global.css`. */
export const INK = '#22301f';

/**
 * Returns the readable foreground color on top of `hex`: white for dark/mid
 * backgrounds, ink for light ones (WCAG relative-luminance method via
 * `theme.luminance`). Unlike `theme.contrastText`, this uses the stricter
 * `READABLE_TEXT_THRESHOLD` and the design-token ink.
 */
export function readableTextOn(hex: string): string {
  return luminance(hexToRgb(hex)) > READABLE_TEXT_THRESHOLD ? INK : '#ffffff';
}


