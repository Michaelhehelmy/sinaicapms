import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Switch } from '@/components/ui/Switch';

describe('Switch', () => {
  it('renders a button with role="switch"', () => {
    render(<Switch checked={false} />);
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('shows aria-checked=false when unchecked', () => {
    render(<Switch checked={false} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('shows aria-checked=true when checked', () => {
    render(<Switch checked={true} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onCheckedChange with true when clicked while unchecked', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('calls onCheckedChange with false when clicked while checked', () => {
    const onChange = vi.fn();
    render(<Switch checked={true} onCheckedChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('renders label text', () => {
    render(<Switch checked={false} label="Dark mode" />);
    expect(screen.getByText('Dark mode')).toBeInTheDocument();
  });

  it('label is associated with the switch via htmlFor', () => {
    render(<Switch checked={false} id="dark" label="Dark mode" />);
    const label = screen.getByText('Dark mode');
    expect(label).toHaveAttribute('for', 'dark');
  });

  it('disables the switch when disabled', () => {
    render(<Switch checked={false} disabled />);
    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('does not call onCheckedChange when disabled', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} disabled onCheckedChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies checked background color', () => {
    render(<Switch checked={true} />);
    expect(screen.getByRole('switch').className).toContain('bg-brand-600');
  });

  it('applies unchecked background color', () => {
    render(<Switch checked={false} />);
    expect(screen.getByRole('switch').className).toContain('bg-gray-300');
  });

  it('label has reduced opacity when disabled', () => {
    const { container } = render(<Switch checked={false} disabled label="Off" />);
    const label = container.querySelector('label');
    expect(label?.className).toContain('opacity-60');
  });
});
