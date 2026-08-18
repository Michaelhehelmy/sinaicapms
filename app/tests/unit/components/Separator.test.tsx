import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Separator } from '@/components/ui/Separator';

describe('Separator', () => {
  it('renders a div element', () => {
    const { container } = render(<Separator />);
    expect(container.firstElementChild).toBeInTheDocument();
  });

  it('has role="none" when decorative (default)', () => {
    render(<Separator />);
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    const div = document.querySelector('[role="none"]');
    expect(div).toBeInTheDocument();
  });

  it('has role="separator" when decorative=false', () => {
    render(<Separator decorative={false} />);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('defaults to horizontal orientation', () => {
    const { container } = render(<Separator />);
    const div = container.firstElementChild!;
    expect(div.className).toContain('h-px');
    expect(div.className).toContain('w-full');
  });

  it('renders vertical orientation', () => {
    const { container } = render(<Separator orientation="vertical" />);
    const div = container.firstElementChild!;
    expect(div.className).toContain('w-px');
    expect(div.className).toContain('self-stretch');
  });

  it('sets aria-orientation when non-decorative and vertical', () => {
    render(<Separator orientation="vertical" decorative={false} />);
    expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'vertical');
  });

  it('sets aria-orientation when non-decorative and horizontal', () => {
    render(<Separator orientation="horizontal" decorative={false} />);
    expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'horizontal');
  });

  it('does not set aria-orientation when decorative', () => {
    render(<Separator decorative />);
    const div = document.querySelector('[role="none"]');
    expect(div).not.toHaveAttribute('aria-orientation');
  });

  it('accepts custom className', () => {
    const { container } = render(<Separator className="my-sep" />);
    expect(container.firstElementChild!.className).toContain('my-sep');
  });
});
