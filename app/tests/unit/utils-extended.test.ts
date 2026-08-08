import { describe, it, expect } from 'vitest';
import { escHtml, formatCurrency, formatDate, cn, slugify, debounce, truncate } from '@/lib/utils';

describe('escHtml', () => {
  it('escapes HTML entities', () => {
    expect(escHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('handles ampersands', () => {
    expect(escHtml('a & b')).toBe('a &amp; b');
  });

  it('handles empty string', () => {
    expect(escHtml('')).toBe('');
  });

  it('handles non-string input', () => {
    expect(escHtml(null as unknown as string)).toBe('');
    expect(escHtml(undefined as unknown as string)).toBe('');
    expect(escHtml(42 as unknown as string)).toBe('42');
  });

  it('escapes single quotes', () => {
    expect(escHtml("it's")).toBe('it&#39;s');
  });
});

describe('formatCurrency', () => {
  it('formats USD by default', () => {
    const result = formatCurrency(1234.56);
    expect(result).toContain('1,234.56');
  });

  it('handles zero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0');
  });

  it('handles undefined', () => {
    const result = formatCurrency(undefined as unknown as number);
    expect(result).toContain('0.00');
  });

  it('formats EGP', () => {
    const result = formatCurrency(100, 'EGP');
    expect(result).toContain('100');
  });

  it('formats integer as decimal', () => {
    const result = formatCurrency(50);
    expect(result).toContain('50.00');
  });
});

describe('formatDate', () => {
  it('formats date string', () => {
    const result = formatDate('2026-01-15');
    expect(result).toContain('Jan');
    expect(result).toContain('15');
    expect(result).toContain('2026');
  });

  it('formats timestamp number', () => {
    const d = new Date('2026-06-01').getTime();
    const result = formatDate(d);
    expect(result).toContain('Jun');
  });

  it('formats Date object', () => {
    const d = new Date('2026-12-25');
    const result = formatDate(d);
    expect(result).toContain('Dec');
    expect(result).toContain('25');
  });

  it('accepts custom options', () => {
    const result = formatDate('2026-03-10', { year: 'numeric', month: 'long' });
    expect(result).toContain('March');
    expect(result).toContain('2026');
  });

  it('throws on invalid date', () => {
    expect(() => formatDate('not-a-date')).toThrow();
  });
});

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('filters falsy values', () => {
    expect(cn('foo', false, null, undefined, 'bar')).toBe('foo bar');
  });

  it('returns empty string for no classes', () => {
    expect(cn()).toBe('');
    expect(cn(null, undefined, false)).toBe('');
  });
});

describe('slugify', () => {
  it('converts to URL-safe slug', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
  });

  it('handles special characters', () => {
    expect(slugify('Camp #1 @ Sinai')).toBe('camp-1-sinai');
  });

  it('trims and lowercases', () => {
    expect(slugify('  UPPER CASE  ')).toBe('upper-case');
  });

  it('collapses multiple hyphens', () => {
    expect(slugify('a---b')).toBe('a-b');
  });

  it('strips leading and trailing dashes', () => {
    expect(slugify('-hello-')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });
});

describe('debounce', () => {
  it('calls function after delay', async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('arg1');
    expect(fn).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 150));
    expect(fn).toHaveBeenCalledWith('arg1');
  });

  it('cancels previous call when called again', async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('first');
    await new Promise((r) => setTimeout(r, 50));
    debounced('second');
    await new Promise((r) => setTimeout(r, 150));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('second');
  });

  it('clears timer after execution', async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);
    debounced();
    await new Promise((r) => setTimeout(r, 100));
    debounced();
    await new Promise((r) => setTimeout(r, 100));
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('truncate', () => {
  it('truncates long strings', () => {
    expect(truncate('Hello World', 5)).toBe('Hello…');
  });

  it('does not truncate short strings', () => {
    expect(truncate('Hi', 5)).toBe('Hi');
  });

  it('handles null/undefined', () => {
    expect(truncate(null as unknown as string, 5)).toBe('');
    expect(truncate(undefined as unknown as string, 5)).toBe('');
  });

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('');
  });
});
