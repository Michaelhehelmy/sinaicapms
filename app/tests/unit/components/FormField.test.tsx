import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormField } from '@/components/ui/FormField';

describe('FormField', () => {
  it('renders label', () => {
    render(
      <FormField label="Camp name">
        <input />
      </FormField>,
    );
    expect(screen.getByText('Camp name')).toBeInTheDocument();
  });

  it('does not render label when not provided', () => {
    const { container } = render(
      <FormField>
        <input />
      </FormField>,
    );
    expect(container.querySelector('label')).not.toBeInTheDocument();
  });

  it('shows required indicator when required', () => {
    render(
      <FormField label="Email" required>
        <input />
      </FormField>,
    );
    expect(screen.getByText('*')).toBeInTheDocument();
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
  });

  it('does not show required indicator when not required', () => {
    const { container } = render(
      <FormField label="Email">
        <input />
      </FormField>,
    );
    expect(container.querySelector('label')?.textContent).toBe('Email');
  });

  it('renders error message', () => {
    render(
      <FormField label="Name" error="Required field">
        <input />
      </FormField>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Required field');
  });

  it('error has role="alert"', () => {
    render(
      <FormField error="Something went wrong">
        <input />
      </FormField>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders hint when no error', () => {
    render(
      <FormField label="Name" hint="Shown on marketplace">
        <input />
      </FormField>,
    );
    expect(screen.getByText('Shown on marketplace')).toBeInTheDocument();
  });

  it('does not show hint when error is present', () => {
    render(
      <FormField error="Error" hint="Helper">
        <input />
      </FormField>,
    );
    expect(screen.queryByText('Helper')).not.toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <FormField label="Input">
        <input data-testid="inner" />
      </FormField>,
    );
    expect(screen.getByTestId('inner')).toBeInTheDocument();
  });

  it('uses provided htmlFor', () => {
    render(
      <FormField label="Email" htmlFor="email-input">
        <input id="email-input" />
      </FormField>,
    );
    const label = screen.getByText('Email');
    expect(label).toHaveAttribute('for', 'email-input');
  });
});
