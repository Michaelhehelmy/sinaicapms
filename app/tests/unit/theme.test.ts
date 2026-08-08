import { describe, expect, it } from 'vitest';
import {
  BRAND_FONT_FAMILY,
  CONTRAST_THRESHOLD,
  DEFAULT_PRIMARY,
  buildTenantTheme,
  contrastText,
  deriveAccent,
  hexToHsl,
  hexToRgb,
  hslToHex,
  luminance,
  normalizeHex,
  toCssVars,
} from '@/lib/theme';

describe('normalizeHex', () => {
  it('keeps a valid 6-digit hex untouched', () => {
    expect(normalizeHex('#4a7c4f')).toBe('#4a7c4f');
  });

  it('lowercases uppercase 6-digit hex', () => {
    expect(normalizeHex('#4A7C4F')).toBe('#4a7c4f');
  });

  it('expands 3-digit shorthand', () => {
    expect(normalizeHex('#abc')).toBe('#aabbcc');
    expect(normalizeHex('#FFF')).toBe('#ffffff');
  });

  it('expands 4-digit RGBA and drops the alpha channel', () => {
    expect(normalizeHex('#abcd')).toBe('#aabbcc');
    expect(normalizeHex('#FEDC')).toBe('#ffeedd');
  });

  it('drops the alpha channel from 8-digit hex (hydration-safety decision)', () => {
    // 8-digit hex in inline styles breaks React 18 hydration — the theme
    // builder normalizes to opaque 6-digit hex and never emits alpha.
    expect(normalizeHex('#2e7d3208')).toBe('#2e7d32');
    expect(normalizeHex('#FFFFFFFF')).toBe('#ffffff');
  });

  it('falls back for empty / whitespace input', () => {
    expect(normalizeHex('')).toBe(DEFAULT_PRIMARY);
    expect(normalizeHex('   ')).toBe(DEFAULT_PRIMARY);
  });

  it('falls back when the # prefix is missing', () => {
    expect(normalizeHex('4a7c4f')).toBe(DEFAULT_PRIMARY);
    expect(normalizeHex('red')).toBe(DEFAULT_PRIMARY);
  });

  it('falls back for non-hex digits', () => {
    expect(normalizeHex('#gggggg')).toBe(DEFAULT_PRIMARY);
    expect(normalizeHex('#12zz45')).toBe(DEFAULT_PRIMARY);
  });

  it('falls back for unsupported digit counts (5 and 7 digits)', () => {
    expect(normalizeHex('#12345')).toBe(DEFAULT_PRIMARY);
    expect(normalizeHex('#1234567')).toBe(DEFAULT_PRIMARY);
  });

  it('falls back for non-string inputs', () => {
    expect(normalizeHex(null)).toBe(DEFAULT_PRIMARY);
    expect(normalizeHex(undefined)).toBe(DEFAULT_PRIMARY);
    expect(normalizeHex(42)).toBe(DEFAULT_PRIMARY);
  });
});

describe('hexToRgb', () => {
  it('parses #4a7c4f', () => {
    expect(hexToRgb('#4a7c4f')).toEqual({ r: 74, g: 124, b: 79 });
  });

  it('parses black', () => {
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('normalizes invalid input before parsing', () => {
    expect(hexToRgb('#gggggg')).toEqual({ r: 74, g: 124, b: 79 });
  });
});

describe('luminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(luminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(luminance({ r: 255, g: 255, b: 255 })).toBe(1);
  });

  it('computes WCAG relative luminance for the default brand color', () => {
    expect(luminance(hexToRgb('#4a7c4f'))).toBeCloseTo(0.1644, 3);
  });

  it('uses the linear branch for bright channels', () => {
    // 10/255 ≈ 0.039 → channel = 0.039/12.92 (below the 0.03928 cutoff)
    const dark = luminance({ r: 10, g: 10, b: 10 });
    const bright = luminance({ r: 200, g: 200, b: 200 });
    expect(dark).toBeLessThan(bright);
    expect(bright).toBeGreaterThan(0.5);
  });
});

describe('contrastText', () => {
  it('returns white on dark surfaces', () => {
    expect(contrastText(hexToRgb('#4a7c4f'))).toBe('#ffffff');
    expect(contrastText({ r: 0, g: 0, b: 0 })).toBe('#ffffff');
  });

  it('returns near-black on bright surfaces', () => {
    expect(contrastText({ r: 255, g: 255, b: 255 })).toBe('#1a1a1a');
    expect(contrastText(hexToRgb('#ffcc00'))).toBe('#1a1a1a');
  });

  it('respects the luminance threshold', () => {
    // rgb(100,100,100) ≈ 0.128 → below threshold → white
    expect(contrastText({ r: 100, g: 100, b: 100 })).toBe('#ffffff');
    // rgb(180,180,180) ≈ 0.456 → above threshold → dark
    expect(contrastText({ r: 180, g: 180, b: 180 })).toBe('#1a1a1a');
    expect(CONTRAST_THRESHOLD).toBeGreaterThan(0.1);
    expect(CONTRAST_THRESHOLD).toBeLessThan(0.3);
  });
});

describe('hexToHsl', () => {
  it('converts the brand green', () => {
    const hsl = hexToHsl('#4a7c4f');
    expect(hsl.h).toBeCloseTo(126, 0);
    expect(hsl.s).toBeCloseTo(0.253, 3);
    expect(hsl.l).toBeCloseTo(0.388, 3);
  });

  it('handles achromatic colors (saturation 0)', () => {
    const hsl = hexToHsl('#808080');
    expect(hsl.h).toBe(0);
    expect(hsl.s).toBe(0);
    expect(hsl.l).toBeCloseTo(128 / 255, 5);
  });

  it('normalizes negative hues back into [0, 360)', () => {
    // Red-dominant with b > g yields a negative h before normalization.
    expect(hexToHsl('#ff3366').h).toBeCloseTo(345, 0);
  });
});

describe('hslToHex', () => {
  it.each([
    [0, '#ff0000'],
    [60, '#ffff00'],
    [120, '#00ff00'],
    [180, '#00ffff'],
    [240, '#0000ff'],
    [300, '#ff00ff'],
  ])('maps hue %i to %s', (hue, expected) => {
    expect(hslToHex(hue, 1, 0.5)).toBe(expected);
  });

  it('round-trips the brand color', () => {
    expect(hslToHex(126, 0.2526, 0.3882)).toBe('#4a7c4f');
  });

  it('pads single-digit channel values', () => {
    expect(hslToHex(0, 1, 0.02)).toBe('#0a0000');
  });
});

describe('deriveAccent', () => {
  it('is deterministic for the same primary', () => {
    expect(deriveAccent('#4a7c4f')).toBe(deriveAccent('#4a7c4f'));
  });

  it('differs from the primary color', () => {
    expect(deriveAccent('#4a7c4f')).not.toBe('#4a7c4f');
  });

  it('emits a 6-digit hex color', () => {
    expect(deriveAccent('#336699')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('toCssVars', () => {
  it('emits the exact brand custom-property set', () => {
    const vars = toCssVars({
      primary: '#4a7c4f',
      accent: '#5c9c64',
      contrast: '#ffffff',
      fontFamily: BRAND_FONT_FAMILY,
    });
    expect(vars).toEqual({
      '--brand-primary': '#4a7c4f',
      '--brand-accent': '#5c9c64',
      '--brand-contrast': '#ffffff',
      '--brand-font': BRAND_FONT_FAMILY,
    });
    expect(Object.keys(vars)).toHaveLength(4);
  });
});

describe('buildTenantTheme', () => {
  it('builds the default theme when no tenant is provided', () => {
    const theme = buildTenantTheme();
    expect(theme.primary).toBe(DEFAULT_PRIMARY);
    expect(theme.accent).toBe(deriveAccent(DEFAULT_PRIMARY));
    expect(theme.contrast).toBe('#ffffff');
    expect(theme.darkMode).toBe('class');
    expect(theme.fontFamily).toBe(BRAND_FONT_FAMILY);
    expect(theme.cssVars['--brand-primary']).toBe(DEFAULT_PRIMARY);
  });

  it('builds the default theme for an explicit null tenant', () => {
    expect(buildTenantTheme(null).primary).toBe(DEFAULT_PRIMARY);
  });

  it('derives the full palette from a tenant primary color', () => {
    const theme = buildTenantTheme({ primaryColor: '#336699' });
    expect(theme.primary).toBe('#336699');
    expect(theme.accent).toBe(deriveAccent('#336699'));
    expect(theme.contrast).toBe(contrastText(hexToRgb('#336699')));
    expect(theme.cssVars).toEqual({
      '--brand-primary': theme.primary,
      '--brand-accent': theme.accent,
      '--brand-contrast': theme.contrast,
      '--brand-font': BRAND_FONT_FAMILY,
    });
  });

  it('normalizes short and 8-digit inputs through the pipeline', () => {
    expect(buildTenantTheme({ primaryColor: '#fff' }).primary).toBe('#ffffff');
    expect(buildTenantTheme({ primaryColor: '#2e7d3208' }).primary).toBe('#2e7d32');
  });

  it('falls back for invalid input', () => {
    expect(buildTenantTheme({ primaryColor: 'not-a-color' }).primary).toBe(DEFAULT_PRIMARY);
    expect(buildTenantTheme({ primaryColor: null }).primary).toBe(DEFAULT_PRIMARY);
  });
});
