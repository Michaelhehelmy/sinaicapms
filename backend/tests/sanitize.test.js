import { describe, it, expect } from 'vitest';
import { sanitizeString, sanitizeObject, sanitizeInput } from '../src/middleware/sanitize.js';

describe('XSS Sanitization Middleware', () => {
  describe('sanitizeString', () => {
    it('passes clean strings through unchanged', () => {
      expect(sanitizeString('Hello World')).toBe('Hello World');
      expect(sanitizeString('Price: $99.99')).toBe('Price: $99.99');
      expect(sanitizeString('')).toBe('');
    });

    it('strips <script> tags', () => {
      expect(sanitizeString('<script>alert("xss")</script>')).toBe('');
      expect(sanitizeString('Hello <script>alert("xss")</script> World')).toBe('Hello  World');
    });

    it('strips <script> with attributes', () => {
      expect(sanitizeString('<script type="text/javascript">alert("xss")</script>')).toBe('');
      expect(sanitizeString('<SCRIPT SRC="evil.js"></SCRIPT>')).toBe('');
    });

    it('strips on* event handlers', () => {
      // onerror=alert(1) is stripped entirely (including preceding whitespace), leaving <img src="x">
      expect(sanitizeString('<img onerror=alert(1) src="x">')).toBe('<img src="x">');
      // onclick="alert(1)" stripped (including preceding space), leaving <div>Click</div>
      expect(sanitizeString('<div onclick="alert(1)">Click</div>')).toBe('<div>Click</div>');
      // Standalone on* without preceding whitespace (not in a tag context) is not a XSS vector
      expect(sanitizeString('onload=alert(1)')).toBe('onload=alert(1)');
    });

    it('strips javascript: protocol in href', () => {
      // The entire href="javascript:..." is stripped
      expect(sanitizeString('<a href="javascript:alert(1)">Click</a>')).toBe('<a >Click</a>');
    });

    it('preserves non-XSS content', () => {
      expect(sanitizeString('Price: $50 & tax')).toBe('Price: $50 & tax');
      // < and > without script tags are NOT stripped (they're not XSS vectors)
      expect(sanitizeString('Room 1 < Room 2')).toBe('Room 1 < Room 2');
      expect(sanitizeString('A > B > C')).toBe('A > B > C');
    });

    it('handles nested script tags', () => {
      // Inner <script>...</script> is stripped, outer malformed tag remains
      expect(sanitizeString('<scr<script>ipt>alert("xss")</scr</script>ipt>')).toBe('<script>');
    });

    it('returns non-string values unchanged', () => {
      expect(sanitizeString(null)).toBe(null);
      expect(sanitizeString(undefined)).toBe(undefined);
      expect(sanitizeString(42)).toBe(42);
    });
  });

  describe('sanitizeObject', () => {
    it('sanitizes nested string values', () => {
      const input = {
        name: 'Test <script>alert("xss")</script>',
        description: 'Safe text',
        meta: {
          value: '<img onerror=alert(1)>',
        },
      };
      const result = sanitizeObject(input);
      expect(result.name).toBe('Test ');
      expect(result.description).toBe('Safe text');
      // onerror=alert(1) stripped, leaving <img>
      expect(result.meta.value).toBe('<img>');
    });

    it('sanitizes arrays of strings', () => {
      const input = ['<script>alert(1)</script>', 'Clean', '<img onerror=alert(2)>'];
      const result = sanitizeObject(input);
      expect(result).toEqual(['', 'Clean', '<img>']);
    });

    it('preserves non-string values', () => {
      const input = { count: 42, active: true, items: [1, 2, 3] };
      const result = sanitizeObject(input);
      expect(result).toEqual({ count: 42, active: true, items: [1, 2, 3] });
    });

    it('handles null and undefined', () => {
      expect(sanitizeObject(null)).toBe(null);
      expect(sanitizeObject(undefined)).toBe(undefined);
    });
  });

  describe('sanitizeInput middleware', () => {
    it('is a function that returns async middleware', () => {
      const middleware = sanitizeInput();
      expect(typeof middleware).toBe('function');
    });
  });
});
