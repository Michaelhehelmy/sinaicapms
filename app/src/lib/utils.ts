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

/**
 * Google Maps URL utilities for the location field.
 * Supports:
 * - https://www.google.com/maps?q=LAT,LNG
 * - https://www.google.com/maps/place/...
 * - https://maps.google.com/?q=LAT,LNG
 * - https://goo.gl/maps/... (short links)
 * - Plain addresses (returned as-is for display)
 */

/** Check if a string looks like a Google Maps URL */
export function isGoogleMapsUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('google.com/maps') || lower.includes('maps.google.') || lower.includes('goo.gl/maps');
}

/** Extract coordinates (lat,lng) from a Google Maps URL */
export function extractMapCoords(url: string): { lat: string; lng: string } | null {
  if (!url) return null;
  // Pattern: ?q=LAT,LNG or ?ll=LAT,LNG or @LAT,LNG
  const qMatch = url.match(/[?&](?:q|ll)=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (qMatch) return { lat: qMatch[1], lng: qMatch[2] };
  const atMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (atMatch) return { lat: atMatch[1], lng: atMatch[2] };
  return null;
}

/** Convert a Google Maps URL to an embeddable iframe src */
export function mapsUrlToIframe(url: string): string | null {
  const coords = extractMapCoords(url);
  if (coords) {
    return `https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3000!2d${coords.lng}!3d${coords.lat}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1`;
  }
  // For place URLs, use the search embed format
  if (url.includes('/place/')) {
    const placeMatch = url.match(/\/place\/([^/]+)/);
    if (placeMatch) {
      return `https://www.google.com/maps/embed/v1/place?key=&q=${encodeURIComponent(decodeURIComponent(placeMatch[1]))}`;
    }
  }
  return null;
}

/** Get a display-friendly location text from a location value */
export function getLocationDisplay(location: string | null | undefined): string {
  if (!location) return 'Sinai, Egypt';
  // If it's a Google Maps URL, try to extract a readable name
  if (isGoogleMapsUrl(location)) {
    const placeMatch = location.match(/\/place\/([^/]+)/);
    if (placeMatch) {
      return decodeURIComponent(placeMatch[1]).replace(/\+/, ' ');
    }
    // Fall back to coordinates
    const coords = extractMapCoords(location);
    if (coords) return `${coords.lat}, ${coords.lng}`;
  }
  return location;
}


