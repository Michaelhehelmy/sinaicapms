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
});

describe('slugify', () => {
  it('converts to URL-safe slug', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
  });
  it('handles special characters', () => {
    expect(slugify('Camp #1 @ Sinai')).toBe('camp-1-sinai');
  });
});

describe('truncate', () => {
  it('truncates long strings', () => {
    expect(truncate('Hello World', 5)).toBe('Hello…');
  });
  it('does not truncate short strings', () => {
    expect(truncate('Hi', 5)).toBe('Hi');
  });
});

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });
  it('filters falsy values', () => {
    expect(cn('foo', false, null, undefined, 'bar')).toBe('foo bar');
  });
});
