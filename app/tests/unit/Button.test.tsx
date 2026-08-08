import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/Button';

describe('Button', () => {
  it('renders children text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // Variants
  it('renders primary variant by default', () => {
    render(<Button>Primary</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-brand-600');
  });

  it('renders secondary variant', () => {
    render(<Button variant="secondary">Secondary</Button>);
    expect(screen.getByRole('button').className).toContain('bg-warm-100');
  });

  it('renders ghost variant', () => {
    render(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole('button').className).toContain('bg-transparent');
  });

  it('renders danger variant', () => {
    render(<Button variant="danger">Danger</Button>);
    expect(screen.getByRole('button').className).toContain('bg-error-600');
  });

  it('renders success variant', () => {
    render(<Button variant="success">Success</Button>);
    expect(screen.getByRole('button').className).toContain('bg-success-600');
  });

  // Sizes
  it('renders sm size', () => {
    render(<Button size="sm">Small</Button>);
    expect(screen.getByRole('button').className).toContain('px-3');
  });

  it('renders md size (default)', () => {
    render(<Button>Medium</Button>);
    expect(screen.getByRole('button').className).toContain('px-4');
  });

  it('renders lg size', () => {
    render(<Button size="lg">Large</Button>);
    expect(screen.getByRole('button').className).toContain('px-6');
  });

  // Loading state
  it('disables button when loading', () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows aria-busy when loading', () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });

  it('does not call onClick when loading', () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Loading</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  // Disabled state
  it('disables button when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('sets aria-disabled when disabled', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('aria-disabled', 'true');
  });

  // Full width
  it('renders full width when fullWidth is true', () => {
    render(<Button fullWidth>Full</Button>);
    expect(screen.getByRole('button').className).toContain('w-full');
  });

  // Icons
  it('renders leftIcon', () => {
    render(
      <Button leftIcon={<span data-testid="left-icon">←</span>}>With Icon</Button>,
    );
    expect(screen.getByTestId('left-icon')).toBeInTheDocument();
  });

  it('renders rightIcon', () => {
    render(
      <Button rightIcon={<span data-testid="right-icon">→</span>}>With Icon</Button>,
    );
    expect(screen.getByTestId('right-icon')).toBeInTheDocument();
  });

  it('does not render rightIcon when loading', () => {
    render(
      <Button loading rightIcon={<span data-testid="right-icon">→</span>}>
        Loading
      </Button>,
    );
    expect(screen.queryByTestId('right-icon')).not.toBeInTheDocument();
  });

  it('shows spinner when loading', () => {
    const { container } = render(<Button loading>Loading</Button>);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg?.classList.contains('animate-spin')).toBe(true);
  });

  // Custom className
  it('accepts custom className', () => {
    render(<Button className="custom">Custom</Button>);
    expect(screen.getByRole('button').className).toContain('custom');
  });

  // Spread props
  it('forwards type prop', () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });
});
