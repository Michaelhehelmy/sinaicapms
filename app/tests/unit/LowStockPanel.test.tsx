import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LowStockPanel from '@/components/admin/LowStockPanel';

const mockUseLowStock = vi.fn();

vi.mock('@/hooks/useQueryHooks', () => ({
  useLowStock: (...args: unknown[]) => mockUseLowStock(...args),
}));

const defaultHook = {
  data: { items: [], total: 0, page: 1, pageSize: 20, hasMore: false },
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
};

const items = [
  { id: 'i1', name: 'Water Bottles', stockQuantity: 2, minStockLevel: 10, unit: 'pcs', category: 'Beverages', status: 'low' },
  { id: 'i2', name: 'Firewood', stockQuantity: 0, minStockLevel: 5, unit: 'kg', category: 'Supplies', status: 'out' },
];

describe('LowStockPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLowStock.mockReturnValue(defaultHook);
  });

  it('shows a loading spinner while fetching', () => {
    mockUseLowStock.mockReturnValue({ ...defaultHook, isLoading: true });
    render(<LowStockPanel />);
    expect(screen.getByText('Loading low-stock items...')).toBeInTheDocument();
  });

  it('renders low-stock items with status badges', () => {
    mockUseLowStock.mockReturnValue({
      ...defaultHook,
      data: { ...defaultHook.data, items, total: items.length },
    });
    render(<LowStockPanel />);
    expect(screen.getByTestId('low-stock-panel')).toBeInTheDocument();
    expect(screen.getByTestId('low-stock-list')).toBeInTheDocument();
    expect(screen.getByText('Water Bottles')).toBeInTheDocument();
    expect(screen.getByText('Firewood')).toBeInTheDocument();
    expect(screen.getByText('Out of Stock')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('renders an empty state when nothing is low on stock', () => {
    render(<LowStockPanel />);
    expect(screen.getByTestId('low-stock-panel')).toBeInTheDocument();
    expect(screen.getByText('All stocked up')).toBeInTheDocument();
    expect(screen.queryByTestId('low-stock-list')).not.toBeInTheDocument();
  });

  it('renders an error state with a working retry button', () => {
    mockUseLowStock.mockReturnValue({ ...defaultHook, isError: true, error: new Error('boom') });
    render(<LowStockPanel />);
    expect(screen.getByTestId('low-stock-error')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    expect(defaultHook.refetch).toHaveBeenCalled();
  });
});
