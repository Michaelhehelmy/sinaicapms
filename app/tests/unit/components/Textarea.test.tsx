import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Textarea } from '@/components/ui/Textarea';

describe('Textarea', () => {
  it('renders a textarea element', () => {
    render(<Textarea />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders with label', () => {
    render(<Textarea label="Notes" />);
    expect(screen.getByLabelText('Notes')).toBeInTheDocument();
  });

  it('does not render label when not provided', () => {
    const { container } = render(<Textarea />);
    expect(container.querySelector('label')).not.toBeInTheDocument();
  });

  it('shows error message', () => {
    render(<Textarea error="Required" />);
    expect(screen.getByText('Required')).toBeInTheDocument();
  });

  it('sets aria-invalid when error is present', () => {
    render(<Textarea error="Error" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('sets aria-describedby to error id', () => {
    render(<Textarea error="Required" />);
    const textarea = screen.getByRole('textbox');
    const describedBy = textarea.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent('Required');
  });

  it('shows helper text when no error', () => {
    render(<Textarea helperText="Max 500 characters" />);
    expect(screen.getByText('Max 500 characters')).toBeInTheDocument();
  });

  it('sets aria-describedby to helper id', () => {
    render(<Textarea helperText="Help" />);
    const textarea = screen.getByRole('textbox');
    const describedBy = textarea.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent('Help');
  });

  it('does not show helper text when error is present', () => {
    render(<Textarea error="Error" helperText="Helper" />);
    expect(screen.queryByText('Helper')).not.toBeInTheDocument();
  });

  it('disables textarea when disabled', () => {
    render(<Textarea disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('label has reduced opacity when disabled', () => {
    const { container } = render(<Textarea label="Name" disabled />);
    const label = container.querySelector('label');
    expect(label?.className).toContain('opacity-60');
  });

  it('uses provided id', () => {
    render(<Textarea id="my-ta" />);
    expect(document.getElementById('my-ta')).toBeInTheDocument();
  });

  it('forwards placeholder prop', () => {
    render(<Textarea placeholder="Type here" />);
    expect(screen.getByPlaceholderText('Type here')).toBeInTheDocument();
  });

  it('forwards rows prop', () => {
    render(<Textarea rows={5} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('rows', '5');
  });

  it('handles value changes', () => {
    render(<Textarea />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'hello' } });
    expect(textarea.value).toBe('hello');
  });
});
