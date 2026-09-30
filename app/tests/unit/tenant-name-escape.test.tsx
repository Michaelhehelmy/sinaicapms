import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TenantMenu from '@/components/public/TenantMenu';

/**
 * esc-s3: tenant name renders without double-escape.
 *
 * Regression pin for esc-s2 (af1d69b): Astro/React `{...}` expressions
 * auto-escape, so `escHtml()` wrappers were removed from A/B/E sites.
 * Wrapping would double-escape: `escHtml("Michael's House")` → text
 * `"Michael&#39;s House"` rendered literally via `{...}` (React escapes
 * the `&` again → `Michael&amp;#39;s House` in raw HTML).
 *
 * These tests pin the FIXED contract:
 * - "Michael's House" readable as text, no `&#39;` in raw HTML
 * - "Ben & Jerry's" single-escapes `&` once (`&amp;`, never `&amp;amp;`)
 * - `<script>` payload stays inert text (no script element)
 */

function Harness({ name }: { name: string }) {
  // Mirrors the fixed pattern: raw `{tenantName}`, framework auto-escapes.
  return <h1 data-testid="tenant-name">{name}</h1>;
}

const menuBase = {
  meals: [],
  mealCategories: [],
  primaryColor: '#1a73e8',
  whatsappNumber: '201234567890',
} as const;

describe('tenant name renders without double-escape (esc-s2 pin)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders Michael's House as readable text with no &#39; entity", () => {
    const name = "Michael's House";
    const { container } = render(<Harness name={name} />);

    // Readable text — the double-escape bug rendered the literal "Michael&#39;s House".
    expect(screen.getByText(name)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="tenant-name"]')?.textContent).toBe(name);

    // Raw HTML must not carry the escaped entity (single or double-escaped forms).
    const html = container.innerHTML;
    expect(html).not.toContain('&#39;');
    expect(html).not.toContain('&#x27;');
    expect(html).not.toContain('&amp;#39;');
  });

  it("pins the fixed TenantMenu header for Michael's House (no double-escape)", () => {
    const tenantName = "Michael's House";
    const { container } = render(<TenantMenu {...menuBase} tenantName={tenantName} />);

    expect(screen.getByText(tenantName)).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('&#39;');
    expect(container.innerHTML).not.toContain('&amp;#39;');
  });

  it("single-escapes Ben & Jerry's in raw HTML (never double-escapes)", () => {
    const name = "Ben & Jerry's";
    const { container } = render(<Harness name={name} />);

    // Visible text stays raw.
    expect(screen.getByText(name)).toBeInTheDocument();
    expect(container.querySelector('[data-testid="tenant-name"]')?.textContent).toBe(name);

    // Raw HTML single-escapes the ampersand exactly once.
    const html = container.innerHTML;
    expect(html).toContain('&amp;');
    expect(html).not.toContain('&amp;amp;');
    // Apostrophe must not appear as an entity (that is the double-escape signature).
    expect(html).not.toContain('&#39;');
    expect(html).not.toContain('&amp;#39;');
  });

  it('renders a script payload inert as text (no script element)', () => {
    const payload = '<script>alert("xss")</script>';
    const { container } = render(<Harness name={payload} />);

    // No executable script element is created — the payload is a text node.
    expect(container.querySelector('script')).toBeNull();
    // The payload text is visible as inert text, not parsed as markup.
    expect(container.querySelector('[data-testid="tenant-name"]')?.textContent).toBe(payload);
    expect(container.innerHTML).not.toContain('<script>');
  });

  it('renders a script tenantName inert in TenantMenu (no script element)', () => {
    const tenantName = '<script>alert("xss")</script>';
    const { container } = render(<TenantMenu {...menuBase} tenantName={tenantName} />);

    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('alert("xss")');
  });
});
