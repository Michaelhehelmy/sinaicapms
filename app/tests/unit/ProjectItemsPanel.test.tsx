import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ProjectItemsPanel from '@/components/admin/ProjectItemsPanel';

const mockShowToast = vi.fn();
const mockRefreshItems = vi.fn();

const baseItems = [
  { id: 'i1', projectId: 'p1', itemType: 'vehicle', name: 'Bus 01', description: '50-seat coach', basePrice: 250, quantity: 2, status: 'active' },
  { id: 'i2', projectId: 'p1', itemType: 'vehicle', name: 'Van 02', description: '12-seat van', basePrice: 120, quantity: 1, status: 'inactive' },
  { id: 'p9', projectId: 'p1', itemType: 'product', name: 'Snack Pack', basePrice: 8.5, quantity: 40, status: 'active' },
];

const state = vi.hoisted(() => ({ items: [] as any[] }));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/hooks/useQueryHooks', () => ({
  useProjectItemsQuery: () => ({
    data: state.items,
    isLoading: false,
    refetch: mockRefreshItems,
  }),
  useSaveProjectItemMutation: (editId?: string) => ({
    mutateAsync: async (data: unknown) => {
      try {
        return await api.saveProjectItem(data, editId);
      } catch (err) {
        mockShowToast('Error saving item: ' + (err as Error).message, 'error');
      }
    },
    isPending: false,
  }),
  useDeleteProjectItemMutation: () => ({
    mutateAsync: (id: string) => api.deleteProjectItem(id),
    isPending: false,
  }),
}));

vi.mock('@/lib/api', () => ({
  getProjectItems: vi.fn(),
  saveProjectItem: vi.fn(),
  deleteProjectItem: vi.fn(),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (n: number) => `$${Number(n).toFixed(2)}`,
  formatDate: (d: string) => d,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

import * as api from '@/lib/api';
const mockSaveItem = vi.mocked(api.saveProjectItem);
const mockDeleteItem = vi.mocked(api.deleteProjectItem);

describe('ProjectItemsPanel', () => {
  afterEach(() => {
    state.items = [];
    vi.clearAllMocks();
  });

  it('renders the panel header and add button by default', () => {
    render(<ProjectItemsPanel projectId="p1" />);
    expect(screen.getByText('Project Items')).toBeInTheDocument();
    expect(screen.getByTestId('add-item-btn')).toBeInTheDocument();
  });

  it('uses the operation label when provided', () => {
    render(<ProjectItemsPanel projectId="p1" operation={{ label: 'Vehicles', icon: '🚌' }} itemType="vehicle" />);
    expect(screen.getByText('Vehicles')).toBeInTheDocument();
  });

  it('shows empty state when no items', () => {
    render(<ProjectItemsPanel projectId="p1" itemType="vehicle" />);
    expect(screen.getByText('No items yet')).toBeInTheDocument();
    expect(screen.getByText('0 items')).toBeInTheDocument();
  });

  it('renders items and respects the itemType filter', () => {
    state.items = [...baseItems];
    render(<ProjectItemsPanel projectId="p1" itemType="vehicle" />);
    expect(screen.getByText('Bus 01')).toBeInTheDocument();
    expect(screen.getByText('Van 02')).toBeInTheDocument();
    expect(screen.getByText('2 items')).toBeInTheDocument();
    // Product rows are filtered out by the panel when an itemType is fixed
    expect(screen.queryByText('Snack Pack')).not.toBeInTheDocument();
  });

  it('shows all item types when no itemType filter is provided', () => {
    state.items = [...baseItems];
    render(<ProjectItemsPanel projectId="p1" />);
    expect(screen.getByText('Bus 01')).toBeInTheDocument();
    expect(screen.getByText('Snack Pack')).toBeInTheDocument();
    expect(screen.getByText('3 items')).toBeInTheDocument();
  });

  it('reacts to the itemType filter switching', () => {
    state.items = [...baseItems];
    const { rerender } = render(<ProjectItemsPanel projectId="p1" itemType="vehicle" />);
    expect(screen.getByText('Bus 01')).toBeInTheDocument();
    expect(screen.queryByText('Snack Pack')).not.toBeInTheDocument();

    rerender(<ProjectItemsPanel projectId="p1" itemType="product" />);
    expect(screen.getByText('Snack Pack')).toBeInTheDocument();
    expect(screen.queryByText('Bus 01')).not.toBeInTheDocument();
  });

  it('opens the add form and saves a new item', async () => {
    mockSaveItem.mockResolvedValue({} as any);
    render(<ProjectItemsPanel projectId="p1" itemType="vehicle" />);

    fireEvent.click(screen.getByTestId('add-item-btn'));
    await waitFor(() => {
      expect(screen.getByText('Add New Item')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Truck 03' } });
    fireEvent.change(screen.getByLabelText('Base Price'), { target: { value: '300' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'active' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Flatbed truck' } });
    fireEvent.change(screen.getByLabelText('Meta Data (JSON)'), { target: { value: '{"plate":"ABC-123"}' } });

    fireEvent.click(screen.getByText('Save Item'));

    await waitFor(() => {
      expect(mockSaveItem).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'p1',
          itemType: 'vehicle',
          name: 'Truck 03',
          basePrice: 300,
          quantity: 3,
          status: 'active',
          metaData: { plate: 'ABC-123' },
        }),
        undefined,
      );
    });
  });

  it('does not show an item-type picker when itemType is fixed by props', async () => {
    render(<ProjectItemsPanel projectId="p1" itemType="vehicle" />);
    fireEvent.click(screen.getByTestId('add-item-btn'));
    await waitFor(() => {
      expect(screen.getByText('Add New Item')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Item Type *')).not.toBeInTheDocument();
  });

  it('shows an item-type picker when no itemType is fixed', async () => {
    render(<ProjectItemsPanel projectId="p1" />);
    fireEvent.click(screen.getByTestId('add-item-btn'));
    await waitFor(() => {
      expect(screen.getByText('Add New Item')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Item Type *')).toBeInTheDocument();
  });

  it('validates the item name when saving', async () => {
    render(<ProjectItemsPanel projectId="p1" itemType="vehicle" />);
    fireEvent.click(screen.getByTestId('add-item-btn'));
    await waitFor(() => {
      expect(screen.getByText('Add New Item')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save Item'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Item name is required.', 'warning');
    });
    expect(mockSaveItem).not.toHaveBeenCalled();
  });

  it('warns when meta data is not valid JSON', async () => {
    render(<ProjectItemsPanel projectId="p1" itemType="vehicle" />);
    fireEvent.click(screen.getByTestId('add-item-btn'));
    await waitFor(() => {
      expect(screen.getByText('Add New Item')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Van 03' } });
    fireEvent.change(screen.getByLabelText('Meta Data (JSON)'), { target: { value: '{oops' } });
    fireEvent.click(screen.getByText('Save Item'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Meta data must be valid JSON.', 'warning');
    });
    expect(mockSaveItem).not.toHaveBeenCalled();
  });

  it('opens the edit form pre-filled and updates the item', async () => {
    state.items = [...baseItems];
    mockSaveItem.mockResolvedValue({} as any);
    render(<ProjectItemsPanel projectId="p1" itemType="vehicle" />);

    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => {
      expect(screen.getByText('Edit Item')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Name *')).toHaveValue('Bus 01');
    expect(screen.getByLabelText('Base Price')).toHaveValue(250);

    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Bus 01X' } });
    fireEvent.click(screen.getByText('Update Item'));

    await waitFor(() => {
      expect(mockSaveItem).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'p1', itemType: 'vehicle', name: 'Bus 01X' }),
        'i1',
      );
    });
  });

  it('deletes an item after confirmation', async () => {
    state.items = [...baseItems];
    mockDeleteItem.mockResolvedValue({ success: true } as any);
    render(<ProjectItemsPanel projectId="p1" itemType="vehicle" />);

    fireEvent.click(screen.getAllByText('Delete')[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Delete Item')).toBeInTheDocument();
    expect(within(dialog).getByText(/Are you sure you want to delete this item/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockDeleteItem).toHaveBeenCalledWith('i1');
    });
  });

  it('cancels item deletion', async () => {
    state.items = [...baseItems];
    render(<ProjectItemsPanel projectId="p1" itemType="vehicle" />);

    fireEvent.click(screen.getAllByText('Delete')[0]);
    const dialog = await screen.findByRole('dialog');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(mockDeleteItem).not.toHaveBeenCalled();
  });
});