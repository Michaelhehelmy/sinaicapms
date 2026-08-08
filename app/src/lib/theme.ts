/**
 * Per-tenant theme engine.
 *
 * The `tenants` schema (DB is frozen) only exposes `primary_color` for
 * branding. Everything else — accent, contrast text, typography and the
 * dark-mode hook — is derived deterministically from that single value so
 * each tenant portal emits a complete, self-consistent set of CSS custom
 * properties with zero backend changes.
 *
 * IMPORTANT — 8-digit hex decision (logbook 2026-08-03): 8-digit hex
 * (`#RRGGBBAA`) in inline styles breaks React 18 hydration because the
 * browser normalizes it to `rgba(...)` while React's server renderer keeps
 * the raw 8-digit token. The theme builder therefore NEVER emits 8-digit
 * hex. An 8-digit input is normalized by DROPPING the alpha channel and
 * returning the opaque 6-digit color (same for 4-digit `#RGBA`). Colors
 * stay opaque 6-digit hex everywhere; alpha is not re-introduced.
 */

export const DEFAULT_PRIMARY = '#4a7c4f';

/** WCAG relative-luminance breakpoint used by `contrastText` (≈ 0.179). */
export const CONTRAST_THRESHOLD = 0.179;

/** Typography token stack — matches `global.css` `--font-sans`. */
export const BRAND_FONT_FAMILY = "'Plus Jakarta Sans', sans-serif";

export type DarkMode = 'class' | 'off';

/** Structural tenant shape accepted by `buildTenantTheme`. */
export interface ThemeSource {
  primaryColor?: string | null;
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface HslColor {
  h: number;
  s: number;
  l: number;
}

export interface TenantTheme {
  primary: string;
  accent: string;
  contrast: string;
  fontFamily: string;
  darkMode: DarkMode;
  cssVars: {
    '--brand-primary': string;
    '--brand-accent': string;
    '--brand-contrast': string;
    '--brand-font': string;
  };
}

/**
 * Normalize any unknown input into a safe, opaque 6-digit hex color.
 *
 * - `#abc` / `#aabbcc` → accepted (3-digit shorthand is expanded).
 * - `#RGBA` (4-digit) → expanded, alpha dropped.
 * - `#RRGGBBAA` (8-digit) → alpha dropped, 6-digit hex returned (hydration
 *   safety, see module docstring).
 * - anything else → `DEFAULT_PRIMARY`.
 */
export function normalizeHex(input: unknown): string {
  if (typeof input !== 'string') return DEFAULT_PRIMARY;
  const raw = input.trim();
  if (raw.length === 0 || raw[0] !== '#') return DEFAULT_PRIMARY;
  const digits = raw.slice(1);
  if (!/^[0-9a-fA-F]+$/.test(digits)) return DEFAULT_PRIMARY;
  if (digits.length === 6) return `#${digits.toLowerCase()}`;
  if (digits.length === 3) {
    return `#${digits
      .split('')
      .map((char) => char + char)
      .join('')
      .toLowerCase()}`;
  }
  if (digits.length === 4) {
    return `#${digits
      .slice(0, 3)
      .split('')
      .map((char) => char + char)
      .join('')
      .toLowerCase()}`;
  }
  if (digits.length === 8) return `#${digits.slice(0, 6).toLowerCase()}`;
  return DEFAULT_PRIMARY;
}

export function hexToRgb(hex: string): RgbColor {
  const digits = normalizeHex(hex).slice(1);
  return {
    r: parseInt(digits.slice(0, 2), 16),
    g: parseInt(digits.slice(2, 4), 16),
    b: parseInt(digits.slice(4, 6), 16),
  };
}

/** WCAG 2.x relative luminance of an sRGB color (0 = black, 1 = white). */
export function luminance(rgb: RgbColor): number {
  const channel = (value: number): number => {
    const s = value / 255;
    if (s <= 0.03928) return s / 12.92;
    return Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/**
 * Choose the readable text color on top of `rgb`: near-black `#1a1a1a` on
 * bright surfaces, white on dark surfaces (WCAG relative-luminance method,
 * threshold `CONTRAST_THRESHOLD`).
 */
export function contrastText(rgb: RgbColor): '#ffffff' | '#1a1a1a' {
  return luminance(rgb) > CONTRAST_THRESHOLD ? '#1a1a1a' : '#ffffff';
}

export function hexToHsl(hex: string): HslColor {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) {
      h = 60 * (((gn - bn) / d) % 6);
    } else if (max === gn) {
      h = 60 * ((bn - rn) / d + 2);
    } else {
      h = 60 * ((rn - gn) / d + 4);
    }
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

export function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) {
    r = c;
    g = x;
  } else if (hp < 2) {
    r = x;
    g = c;
  } else if (hp < 3) {
    g = c;
    b = x;
  } else if (hp < 4) {
    g = x;
    b = c;
  } else if (hp < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const toHex = (value: number): string =>
    Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r + m)}${toHex(g + m)}${toHex(b + m)}`;
}

/**
 * Deterministic accent derived from the primary brand color: hue shifted
 * +30°, saturation clamped into the brand range [0.4, 0.9], lightness fixed
 * at 45%. Same primary → same accent, always.
 */
export function deriveAccent(primaryHex: string): string {
  const { h, s } = hexToHsl(normalizeHex(primaryHex));
  const accentHue = (h + 30) % 360;
  const accentSaturation = Math.min(0.9, Math.max(0.4, s));
  return hslToHex(accentHue, accentSaturation, 0.45);
}

/** Emit the theme as CSS custom-property declarations (values are 6-digit hex or the font stack). */
export function toCssVars(theme: {
  primary: string;
  accent: string;
  contrast: string;
  fontFamily: string;
}): TenantTheme['cssVars'] {
  return {
    '--brand-primary': theme.primary,
    '--brand-accent': theme.accent,
    '--brand-contrast': theme.contrast,
    '--brand-font': theme.fontFamily,
  };
}

/**
 * Build the full per-tenant theme. `tenant` may be `null`/`undefined`
 * (marketplace / fallback) → the default `#4a7c4f` palette is used.
 */
export function buildTenantTheme(tenant?: ThemeSource | null): TenantTheme {
  const primary = normalizeHex(tenant?.primaryColor);
  const accent = deriveAccent(primary);
  const contrast = contrastText(hexToRgb(primary));
  const fontFamily = BRAND_FONT_FAMILY;
  const darkMode: DarkMode = 'class';
  const cssVars = toCssVars({ primary, accent, contrast, fontFamily });
  return { primary, accent, contrast, fontFamily, darkMode, cssVars };
}
