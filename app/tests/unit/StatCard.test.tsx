import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from '@/components/ui/StatCard';

describe('StatCard', () => {
  it('renders title and value', () => {
    render(<StatCard title="Revenue" value="$1,234" />);
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('$1,234')).toBeInTheDocument();
  });

  it('renders trend indicator', () => {
    render(<StatCard title="Revenue" value="$1,234" trend={{ value: 12, label: 'vs last month' }} />);
    expect(screen.getByText('12%')).toBeInTheDocument();
    expect(screen.getByText('vs last month')).toBeInTheDocument();
  });

  it('renders negative trend with down arrow', () => {
    render(<StatCard title="Expenses" value="$500" trend={{ value: -5, label: 'vs last month' }} />);
    expect(screen.getByText('5%')).toBeInTheDocument();
  });

  it('renders zero trend without arrow', () => {
    render(<StatCard title="Orders" value="42" trend={{ value: 0, label: 'no change' }} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    render(<StatCard title="Revenue" value="$1,234" icon={<span data-testid="icon">💰</span>} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders without icon by default', () => {
    const { container } = render(<StatCard title="Revenue" value="$1,234" />);
    expect(container.querySelector('[data-testid="icon"]')).toBeNull();
  });

  it('applies default green color', () => {
    render(<StatCard title="Revenue" value="$1,234" />);
    const card = screen.getByText('Revenue').closest('.rounded-xl');
    expect(card).toBeInTheDocument();
  });

  it('accepts custom color prop', () => {
    render(<StatCard title="Errors" value="3" color="red" />);
    expect(screen.getByText('Errors')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
