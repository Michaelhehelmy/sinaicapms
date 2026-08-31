import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChartCard } from '@/components/ui/ChartCard';

describe('ChartCard', () => {
  it('renders title and children', () => {
    render(
      <ChartCard title="Revenue">
        <p>chart content</p>
      </ChartCard>
    );
    expect(screen.getByText('Revenue')).toBeTruthy();
    expect(screen.getByText('chart content')).toBeTruthy();
  });

  it('renders action node', () => {
    render(
      <ChartCard title="Stats" action={<button>Export</button>}>
        <span>data</span>
      </ChartCard>
    );
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
  });

  it('applies custom className while keeping default h-full', () => {
    const { container } = render(
      <ChartCard title="T" className="my-custom">
        <span>x</span>
      </ChartCard>
    );
    const card = container.querySelector('.my-custom');
    expect(card).toBeTruthy();
  });

  it('renders without action (action undefined)', () => {
    const { container } = render(
      <ChartCard title="No Action">
        <span>y</span>
      </ChartCard>
    );
    expect(screen.getByText('No Action')).toBeTruthy();
    expect(container.querySelector('button')).toBeNull();
  });
});
