import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BarChart } from '@/components/ui/BarChart';
import { LineChart } from '@/components/ui/LineChart';
import { PieChart } from '@/components/ui/PieChart';
import { MetricCard } from '@/components/ui/MetricCard';
import { ExportButton } from '@/components/ui/ExportButton';
import { BulkActions } from '@/components/ui/BulkActions';
import { DateRangePicker } from '@/components/ui/DateRangePicker';

describe('BarChart', () => {
  it('shows no-data message when data is empty', () => {
    render(<BarChart data={[]} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('shows no-data message when data is null', () => {
    render(<BarChart data={null as unknown as Array<{ name: string; value: number }>} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('renders a chart when data is present', () => {
    render(<BarChart data={[{ name: 'A', value: 10 }]} />);
    expect(screen.queryByText('No data available')).not.toBeInTheDocument();
  });
});

describe('LineChart', () => {
  it('shows no-data message when data is empty', () => {
    render(<LineChart data={[]} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('renders a chart when data is present', () => {
    render(<LineChart data={[{ name: 'A', value: 10 }]} />);
    expect(screen.queryByText('No data available')).not.toBeInTheDocument();
  });
});

describe('PieChart', () => {
  it('shows no-data message when data is empty', () => {
    render(<PieChart data={[]} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('shows no-data message when all values are zero', () => {
    render(<PieChart data={[{ name: 'A', value: 0 }]} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('renders a chart with data and default colors', () => {
    render(<PieChart data={[{ name: 'A', value: 10 }, { name: 'B', value: 20 }]} />);
    expect(screen.queryByText('No data available')).not.toBeInTheDocument();
  });

  it('renders with custom colors', () => {
    render(<PieChart data={[{ name: 'A', value: 10 }]} colors={['#ff0000']} />);
    expect(screen.queryByText('No data available')).not.toBeInTheDocument();
  });
});

describe('MetricCard', () => {
  it('renders title and value', () => {
    render(<MetricCard title="Revenue" value="$1,000" />);
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('$1,000')).toBeInTheDocument();
  });

  it('renders no trend block when trend value is missing', () => {
    render(<MetricCard title="Revenue" value="100" trend="up" />);
    expect(screen.queryByText('No data')).not.toBeInTheDocument();
  });

  it('renders an up trend with trend value', () => {
    render(<MetricCard title="Revenue" value="100" trend="up" trendValue="+12%" />);
    expect(screen.getByText('+12%')).toBeInTheDocument();
  });

  it('renders a down trend with trend value', () => {
    render(<MetricCard title="Revenue" value="100" trend="down" trendValue="-4%" />);
    expect(screen.getByText('-4%')).toBeInTheDocument();
  });

  it('renders a flat trend', () => {
    render(<MetricCard title="Revenue" value="100" trend="flat" trendValue="0%" />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders an icon when provided', () => {
    render(<MetricCard title="Revenue" value="100" icon={<span>💰</span>} />);
    expect(screen.getByText('💰')).toBeInTheDocument();
  });
});

describe('ExportButton', () => {
  it('renders export button', () => {
    render(<ExportButton onExport={() => {}} />);
    expect(screen.getByTestId('export-button')).toBeInTheDocument();
  });

  it('is disabled when loading', () => {
    render(<ExportButton onExport={() => {}} loading />);
    expect(screen.getByTestId('export-button')).toBeDisabled();
  });

  it('is disabled when disabled prop is true', () => {
    render(<ExportButton onExport={() => {}} disabled />);
    expect(screen.getByTestId('export-button')).toBeDisabled();
  });

  it('opens the menu on click and selects a format', () => {
    const onExport = vi.fn();
    render(<ExportButton onExport={onExport} />);
    fireEvent.click(screen.getByTestId('export-button'));
    expect(screen.getByTestId('export-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('export-csv'));
    expect(onExport).toHaveBeenCalledWith('csv');
  });

  it('closes the menu when clicking outside', async () => {
    render(<ExportButton onExport={() => {}} />);
    fireEvent.click(screen.getByTestId('export-button'));
    expect(screen.getByTestId('export-menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByTestId('export-menu')).not.toBeInTheDocument();
    });
  });
});

describe('BulkActions', () => {
  const actions = [
    { label: 'Export Selected', onClick: vi.fn() },
    { label: 'Delete', onClick: vi.fn(), variant: 'danger' as const },
    { label: 'Disabled', onClick: vi.fn(), disabled: true },
  ];

  it('renders nothing when selectedCount is zero', () => {
    const { container } = render(
      <BulkActions selectedCount={0} actions={actions} onClearSelection={() => {}} />,
    );
    expect(container.querySelector('[data-testid="bulk-actions"]')).not.toBeInTheDocument();
  });

  it('renders the toolbar with a singular row label', () => {
    render(<BulkActions selectedCount={1} actions={actions} onClearSelection={() => {}} />);
    expect(screen.getByTestId('bulk-actions')).toBeInTheDocument();
    expect(screen.getByText('1 row selected')).toBeInTheDocument();
  });

  it('renders a plural row label', () => {
    render(<BulkActions selectedCount={3} actions={actions} onClearSelection={() => {}} />);
    expect(screen.getByText('3 rows selected')).toBeInTheDocument();
  });

  it('calls onClearSelection when clear is clicked', () => {
    const onClear = vi.fn();
    render(<BulkActions selectedCount={2} actions={actions} onClearSelection={onClear} />);
    fireEvent.click(screen.getByTestId('clear-selection'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('renders action buttons and calls their onClick', () => {
    render(<BulkActions selectedCount={2} actions={actions} onClearSelection={() => {}} />);
    fireEvent.click(screen.getByTestId('bulk-action-export-selected'));
    expect(actions[0].onClick).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('bulk-action-delete'));
    expect(actions[1].onClick).toHaveBeenCalledTimes(1);
  });

  it('disables an action button that has disabled=true', () => {
    render(<BulkActions selectedCount={2} actions={actions} onClearSelection={() => {}} />);
    expect(screen.getByTestId('bulk-action-disabled')).toBeDisabled();
  });
});

describe('DateRangePicker', () => {
  const today = new Date().toISOString().slice(0, 10);

  it('renders all preset buttons and custom button', () => {
    render(<DateRangePicker value={{ startDate: today, endDate: today }} onChange={() => {}} />);
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Last 7 Days')).toBeInTheDocument();
    expect(screen.getByText('Last 30 Days')).toBeInTheDocument();
    expect(screen.getByText('Last 90 Days')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('calls onChange with the Today range when Today is clicked', () => {
    const onChange = vi.fn();
    render(<DateRangePicker value={{ startDate: today, endDate: today }} onChange={onChange} />);
    fireEvent.click(screen.getByText('Today'));
    expect(onChange).toHaveBeenCalled();
  });

  it('calls onChange with a computed range for a preset', () => {
    const onChange = vi.fn();
    render(<DateRangePicker value={{ startDate: today, endDate: today }} onChange={onChange} />);
    fireEvent.click(screen.getByText('Last 7 Days'));
    const range = onChange.mock.calls[0][0];
    expect(range.startDate).toBeTruthy();
    expect(range.endDate).toBeTruthy();
  });

  it('toggles the custom date inputs', () => {
    render(<DateRangePicker value={{ startDate: today, endDate: today }} onChange={() => {}} />);
    expect(document.querySelectorAll('input[type="date"]').length).toBe(0);
    fireEvent.click(screen.getByText('Custom'));
    expect(document.querySelectorAll('input[type="date"]').length).toBe(2);
  });

  it('updates startDate via custom input', () => {
    const onChange = vi.fn();
    render(<DateRangePicker value={{ startDate: today, endDate: today }} onChange={onChange} />);
    fireEvent.click(screen.getByText('Custom'));
    const inputs = document.querySelectorAll('input[type="date"]') as unknown as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: '2026-01-01' } });
    expect(onChange).toHaveBeenCalledWith({ startDate: '2026-01-01', endDate: today });
  });
});
