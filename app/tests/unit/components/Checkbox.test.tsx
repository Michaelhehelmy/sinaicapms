import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Checkbox } from '@/components/ui/Checkbox';

describe('Checkbox', () => {
  it('renders a checkbox input', () => {
    render(<Checkbox />);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('renders with label', () => {
    render(<Checkbox label="Accept terms" />);
    expect(screen.getByLabelText('Accept terms')).toBeInTheDocument();
  });

  it('toggles checked state on click', () => {
    render(<Checkbox label="Accept" />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it('supports defaultChecked', () => {
    render(<Checkbox label="Pre-checked" defaultChecked />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('renders description text', () => {
    render(<Checkbox label="Terms" description="I agree to the terms" />);
    expect(screen.getByText('I agree to the terms')).toBeInTheDocument();
  });

  it('renders error message', () => {
    render(<Checkbox error="This is required" />);
    expect(screen.getByText('This is required')).toBeInTheDocument();
  });

  it('sets aria-invalid when error is present', () => {
    render(<Checkbox error="Error" />);
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('sets aria-describedby to error id', () => {
    render(<Checkbox error="Required" />);
    const checkbox = screen.getByRole('checkbox');
    const describedBy = checkbox.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent('Required');
  });

  it('sets aria-describedby to description id when no error', () => {
    render(<Checkbox description="Details here" />);
    const checkbox = screen.getByRole('checkbox');
    const describedBy = checkbox.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent('Details here');
  });

  it('does not render label when not provided', () => {
    const { container } = render(<Checkbox />);
    expect(container.querySelector('label')).not.toBeInTheDocument();
  });

  it('disables the checkbox when disabled', () => {
    render(<Checkbox label="Disabled" disabled />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('calls onChange with correct value', () => {
    const onChange = vi.fn();
    render(<Checkbox onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('uses provided id', () => {
    render(<Checkbox id="my-check" />);
    expect(document.getElementById('my-check')).toBeInTheDocument();
  });

  it('label has reduced opacity when disabled', () => {
    const { container } = render(<Checkbox label="Disabled" disabled />);
    const label = container.querySelector('label');
    expect(label?.className).toContain('opacity-60');
  });
});
