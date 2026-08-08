import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from '@/components/ui/EmptyState';

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No data" />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('renders description', () => {
    render(
      <EmptyState title="No data" description="Try adding something first." />,
    );
    expect(screen.getByText('Try adding something first.')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    render(<EmptyState title="No data" />);
    expect(screen.queryByText(/Try adding/)).not.toBeInTheDocument();
  });

  it('renders default icon when no custom icon', () => {
    const { container } = render(<EmptyState title="Empty" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders custom icon when provided', () => {
    render(
      <EmptyState title="Empty" icon={<span data-testid="custom-icon">📦</span>} />,
    );
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('renders action button', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No items"
        action={{ label: 'Add Item', onClick }}
      />,
    );
    expect(screen.getByText('Add Item')).toBeInTheDocument();
  });

  it('calls action onClick when button is clicked', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No items"
        action={{ label: 'Add Item', onClick }}
      />,
    );
    fireEvent.click(screen.getByText('Add Item'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not render action button when not provided', () => {
    render(<EmptyState title="No items" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('has role="status"', () => {
    render(<EmptyState title="Empty" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('accepts custom className', () => {
    const { container } = render(<EmptyState title="Empty" className="custom" />);
    const el = container.querySelector('.custom');
    expect(el).toBeInTheDocument();
  });
});
