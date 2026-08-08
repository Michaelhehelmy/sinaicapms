import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from '@/components/ui/Input';

describe('Input', () => {
  it('renders input element', () => {
    render(<Input />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders with label', () => {
    render(<Input label="Email" />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('does not render label when not provided', () => {
    const { container } = render(<Input />);
    expect(container.querySelector('label')).not.toBeInTheDocument();
  });

  it('shows error message', () => {
    render(<Input error="Required field" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Required field');
  });

  it('sets aria-invalid when error is present', () => {
    render(<Input error="Error" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('sets aria-describedby to error id', () => {
    render(<Input error="Error" />);
    const input = screen.getByRole('textbox');
    const errorId = input.getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId!)).toHaveTextContent('Error');
  });

  it('shows helper text when no error', () => {
    render(<Input helperText="Enter your email" />);
    expect(screen.getByText('Enter your email')).toBeInTheDocument();
  });

  it('does not show helper text when error is present', () => {
    render(<Input error="Error" helperText="Helper" />);
    expect(screen.queryByText('Helper')).not.toBeInTheDocument();
  });

  it('sets aria-describedby to helper id', () => {
    render(<Input helperText="Help text" />);
    const input = screen.getByRole('textbox');
    const helperId = input.getAttribute('aria-describedby');
    expect(helperId).toBeTruthy();
    expect(document.getElementById(helperId!)).toHaveTextContent('Help text');
  });

  it('renders left icon', () => {
    render(
      <Input leftIcon={<span data-testid="left-icon">🔍</span>} />,
    );
    expect(screen.getByTestId('left-icon')).toBeInTheDocument();
  });

  it('renders right icon', () => {
    render(
      <Input rightIcon={<span data-testid="right-icon">✓</span>} />,
    );
    expect(screen.getByTestId('right-icon')).toBeInTheDocument();
  });

  it('applies pl-10 when leftIcon is present', () => {
    const { container } = render(
      <Input leftIcon={<span>🔍</span>} />,
    );
    const input = container.querySelector('input')!;
    expect(input.className).toContain('pl-10');
  });

  it('applies pr-10 when rightIcon is present', () => {
    const { container } = render(
      <Input rightIcon={<span>✓</span>} />,
    );
    const input = container.querySelector('input')!;
    expect(input.className).toContain('pr-10');
  });

  it('disables input when disabled', () => {
    render(<Input disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('uses provided id', () => {
    render(<Input id="my-input" />);
    expect(document.getElementById('my-input')).toBeInTheDocument();
  });

  it('forwards type prop', () => {
    render(<Input type="email" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('type', 'email');
  });

  it('forwards placeholder prop', () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  it('applies error border styling', () => {
    const { container } = render(<Input error="Error" />);
    const input = container.querySelector('input')!;
    expect(input.className).toContain('border-error-500');
  });

  it('applies disabled styling', () => {
    const { container } = render(<Input disabled />);
    const input = container.querySelector('input')!;
    expect(input.className).toContain('bg-gray-50');
    expect(input.className).toContain('cursor-not-allowed');
  });

  it('applies custom className', () => {
    const { container } = render(<Input className="custom" />);
    const input = container.querySelector('input')!;
    expect(input.className).toContain('custom');
  });

  it('label has reduced opacity when disabled', () => {
    const { container } = render(<Input label="Name" disabled />);
    const label = container.querySelector('label')!;
    expect(label.className).toContain('opacity-60');
  });
});
