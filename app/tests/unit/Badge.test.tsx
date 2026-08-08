import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Badge } from '@/components/ui/Badge';

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders with role="status"', () => {
    render(<Badge>Test</Badge>);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // Variant tests
  it('renders default variant', () => {
    const { container } = render(<Badge variant="default">Default</Badge>);
    const badge = container.querySelector('[role="status"]')!;
    expect(badge.className).toContain('bg-warm-100');
    expect(badge.className).toContain('text-gray-700');
  });

  it('renders success variant', () => {
    const { container } = render(<Badge variant="success">Success</Badge>);
    const badge = container.querySelector('[role="status"]')!;
    expect(badge.className).toContain('bg-success-100');
    expect(badge.className).toContain('text-success-700');
  });

  it('renders warning variant', () => {
    const { container } = render(<Badge variant="warning">Warning</Badge>);
    const badge = container.querySelector('[role="status"]')!;
    expect(badge.className).toContain('bg-warning-100');
    expect(badge.className).toContain('text-warning-700');
  });

  it('renders error variant', () => {
    const { container } = render(<Badge variant="error">Error</Badge>);
    const badge = container.querySelector('[role="status"]')!;
    expect(badge.className).toContain('bg-error-100');
    expect(badge.className).toContain('text-error-700');
  });

  it('renders info variant', () => {
    const { container } = render(<Badge variant="info">Info</Badge>);
    const badge = container.querySelector('[role="status"]')!;
    expect(badge.className).toContain('bg-info-100');
    expect(badge.className).toContain('text-info-700');
  });

  it('renders neutral variant', () => {
    const { container } = render(<Badge variant="neutral">Neutral</Badge>);
    const badge = container.querySelector('[role="status"]')!;
    expect(badge.className).toContain('bg-gray-100');
    expect(badge.className).toContain('text-gray-600');
  });

  // Size tests
  it('renders sm size', () => {
    const { container } = render(<Badge size="sm">Small</Badge>);
    const badge = container.querySelector('[role="status"]')!;
    expect(badge.className).toContain('px-2');
    expect(badge.className).toContain('text-xs');
  });

  it('renders md size', () => {
    const { container } = render(<Badge size="md">Medium</Badge>);
    const badge = container.querySelector('[role="status"]')!;
    expect(badge.className).toContain('px-2.5');
  });

  it('renders lg size', () => {
    const { container } = render(<Badge size="lg">Large</Badge>);
    const badge = container.querySelector('[role="status"]')!;
    expect(badge.className).toContain('px-3');
    expect(badge.className).toContain('text-sm');
  });

  // Dot tests
  it('renders dot indicator when dot prop is true', () => {
    const { container } = render(<Badge dot>With Dot</Badge>);
    const dot = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(dot).toBeInTheDocument();
    expect(dot.className).toContain('rounded-full');
  });

  it('does not render dot by default', () => {
    const { container } = render(<Badge>No Dot</Badge>);
    const spans = container.querySelectorAll('span[aria-hidden="true"]');
    expect(spans.length).toBe(0);
  });

  // Removable tests
  it('renders remove button when removable', () => {
    render(<Badge removable onRemove={() => {}}>Removable</Badge>);
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('does not render remove button by default', () => {
    const { container } = render(<Badge>Not Removable</Badge>);
    expect(container.querySelector('button')).not.toBeInTheDocument();
  });

  it('calls onRemove when remove button is clicked', () => {
    const onRemove = vi.fn();
    render(<Badge removable onRemove={onRemove}>Removable</Badge>);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  // Custom className
  it('accepts custom className', () => {
    const { container } = render(<Badge className="custom-class">Custom</Badge>);
    const badge = container.querySelector('[role="status"]')!;
    expect(badge.className).toContain('custom-class');
  });
});
