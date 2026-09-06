import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LineChart } from '@/components/ui/LineChart';

// T21: recharts is split out of LineChart into an async chunk (RechartsLine).
// The chunk is the single recharts consumer and is lazy-loaded behind a
// Suspense fallback. Stub it here so the smoke test can assert LineChart
// delegates chart rendering to the split without pulling real recharts
// (ResponsiveContainer needs a real browser layout to paint).
vi.mock('@/components/ui/RechartsLine', () => ({
  default: ({ data, color, height }: { data: Array<{ name: string; value: number }>; color?: string; height?: number }) => (
    <div data-testid="recharts-line" data-color={color} data-height={height}>
      {data.map((d) => `${d.name}:${d.value}`).join('|')}
    </div>
  ),
}));

describe('LineChart', () => {
  it('shows no-data message when data is empty', () => {
    render(<LineChart data={[]} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('renders a chart when data is present', () => {
    render(<LineChart data={[{ name: 'A', value: 10 }]} />);
    expect(screen.queryByText('No data available')).not.toBeInTheDocument();
  });

  it('delegates chart rendering to the async RechartsLine split (T21)', async () => {
    render(<LineChart data={[{ name: 'A', value: 10 }, { name: 'B', value: 20 }]} color="#ff0000" height={120} />);

    // RechartsLine is lazy-loaded — after the async chunk resolves, the
    // Suspense fallback is replaced by the chart itself.
    const chart = await screen.findByTestId('recharts-line');
    expect(chart).toHaveTextContent('A:10|B:20');
    expect(chart).toHaveAttribute('data-color', '#ff0000');
    expect(chart).toHaveAttribute('data-height', '120');
  });

  it('empty data renders the synchronous no-data state without touching the recharts split (T21)', () => {
    render(<LineChart data={[]} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
    // The async recharts chunk must not be fetched for empty panels:
    expect(screen.queryByTestId('recharts-line')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading chart…')).not.toBeInTheDocument();
  });
});