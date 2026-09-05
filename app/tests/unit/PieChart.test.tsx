import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { PieChart } from '@/components/ui/PieChart';

// Recharts rendering depends on a measured container + internal hooks that
// never run in jsdom. Mock the recharts primitives as controllable wrappers so
// we can assert our component passes data/colors and invokes the Legend
// formatter callback, while still exercising the data-guard paths directly.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="rc">{children}</div>,
  PieChart: ({ children }: any) => <svg data-testid="piechart">{children}</svg>,
  Pie: ({ children }: any) => <g data-testid="pie">{children}</g>,
  Cell: ({ fill }: any) => <rect data-testid="cell" fill={fill} />,
  Tooltip: () => <g data-testid="tooltip" />,
  Legend: ({ formatter }: any) => {
    const item = { value: 'Food' };
    return <div data-testid="legend">{formatter ? formatter(item.value, item, 0) : item.value}</div>;
  },
}));

describe('PieChart', () => {
  it('shows no-data message when data is empty', () => {
    render(<PieChart data={[]} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('shows no-data message when all values are zero', () => {
    render(<PieChart data={[{ name: 'A', value: 0 }]} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('renders with data and invokes the legend formatter', () => {
    render(<PieChart data={[{ name: 'Food', value: 40 }, { name: 'Beverage', value: 60 }]} />);
    expect(screen.getByTestId('piechart')).toBeInTheDocument();
    expect(screen.getByTestId('legend').textContent).toContain('Food');
  });

  it('passes custom colors to cells', () => {
    render(<PieChart data={[{ name: 'A', value: 1 }, { name: 'B', value: 2 }]} colors={['#111111', '#222222']} />);
    const cells = screen.getAllByTestId('cell');
    expect(cells).toHaveLength(2);
    expect(cells[0].getAttribute('fill')).toBe('#111111');
    expect(cells[1].getAttribute('fill')).toBe('#222222');
  });
});
