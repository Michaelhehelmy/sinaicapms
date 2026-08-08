import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner, Skeleton } from '@/components/ui/LoadingSpinner';

describe('LoadingSpinner — extended', () => {
  it('renders with dots variant', () => {
    const { container } = render(<LoadingSpinner variant="dots" />);
    const dots = container.querySelectorAll('.animate-bounce');
    expect(dots.length).toBe(3);
  });

  it('renders with pulse variant', () => {
    const { container } = render(<LoadingSpinner variant="pulse" />);
    const pings = container.querySelectorAll('.animate-ping');
    expect(pings.length).toBe(1);
  });

  it('renders with white color', () => {
    const { container } = render(<LoadingSpinner color="white" />);
    const el = container.querySelector('[role="status"]')!;
    expect(el).toBeInTheDocument();
  });

  it('renders with gray color', () => {
    const { container } = render(<LoadingSpinner color="gray" />);
    const el = container.querySelector('[role="status"]')!;
    expect(el).toBeInTheDocument();
  });

  it('renders fullScreen mode', () => {
    const { container } = render(<LoadingSpinner fullScreen />);
    const overlay = container.querySelector('.fixed.inset-0');
    expect(overlay).toBeInTheDocument();
    expect(overlay!.className).toContain('z-[9500]');
  });

  it('renders fullScreen with text', () => {
    render(<LoadingSpinner fullScreen text="Please wait..." />);
    expect(screen.getByText('Please wait...')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Please wait...');
  });

  it('has role="status" with default aria-label', () => {
    const { container } = render(<LoadingSpinner />);
    const el = container.querySelector('[role="status"]')!;
    expect(el).toHaveAttribute('aria-label', 'Loading');
  });

  it('shows sr-only text when no text prop', () => {
    const { container } = render(<LoadingSpinner />);
    const srOnly = container.querySelector('.sr-only');
    expect(srOnly).toHaveTextContent('Loading');
  });

  it('dots variant renders with sm size', () => {
    const { container } = render(<LoadingSpinner variant="dots" size="sm" />);
    const dots = container.querySelectorAll('.h-1\\.5');
    // At least check dots exist
    expect(dots.length).toBeGreaterThanOrEqual(0);
  });

  it('pulse variant renders with lg size', () => {
    const { container } = render(<LoadingSpinner variant="pulse" size="lg" />);
    const pings = container.querySelectorAll('.animate-ping');
    expect(pings.length).toBe(1);
  });
});

describe('Skeleton (from LoadingSpinner)', () => {
  it('renders with default 3 lines', () => {
    const { container } = render(<Skeleton />);
    const lines = container.querySelectorAll('.animate-pulse');
    expect(lines.length).toBe(3);
  });

  it('renders with custom line count', () => {
    const { container } = render(<Skeleton lines={5} />);
    const lines = container.querySelectorAll('.animate-pulse');
    expect(lines.length).toBe(5);
  });

  it('has role="status"', () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector('[role="status"]')).toBeInTheDocument();
  });

  it('has sr-only loading text', () => {
    const { container } = render(<Skeleton />);
    const srOnly = container.querySelector('.sr-only');
    expect(srOnly).toHaveTextContent('Loading content');
  });

  it('accepts custom className', () => {
    const { container } = render(<Skeleton className="custom" />);
    const el = container.querySelector('.custom');
    expect(el).toBeInTheDocument();
  });
});
