import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Restaurant pillar views (0069): TableView + KitchenView ───────────────
// Same isolation contract as PosViews.test.tsx: every render gets a fresh
// QueryClient so TanStack caches never leak between tests.

const mockShowToast = vi.fn();

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/api', () => ({
  getPosTables: vi.fn(),
  createPosTable: vi.fn(),
  updatePosTable: vi.fn(),
  updatePosTableStatus: vi.fn(),
  deletePosTable: vi.fn(),
  updateKitchenStatus: vi.fn(),
  posGetOrders: vi.fn(),
  posGetOrder: vi.fn(),
}));

import * as api from '@/lib/api';
import TableView from '@/components/pos/views/TableView';
import KitchenView from '@/components/pos/views/KitchenView';

const mockGetPosTables = vi.mocked(api.getPosTables);
const mockCreatePosTable = vi.mocked(api.createPosTable);
const mockUpdatePosTableStatus = vi.mocked(api.updatePosTableStatus);
const mockUpdateKitchenStatus = vi.mocked(api.updateKitchenStatus);
const mockPosGetOrders = vi.mocked(api.posGetOrders);
const mockPosGetOrder = vi.mocked(api.posGetOrder);

const tableList = {
  sections: [
    {
      section: 'Terrace',
      tables: [
        { id: 'tbl_a', tenantId: 'acacia', name: 'T1', capacity: 4, status: 'available', section: 'Terrace', createdAt: '' },
        { id: 'tbl_b', tenantId: 'acacia', name: 'T2', capacity: 2, status: 'occupied', section: 'Terrace', createdAt: '' },
      ],
    },
    {
      section: null,
      tables: [
        { id: 'tbl_c', tenantId: 'acacia', name: 'B1', capacity: 6, status: 'cleaning', section: null, createdAt: '' },
      ],
    },
  ],
  total: 3,
} as any;

const dineInOrder = {
  id: 'ord_1',
  orderNumber: 'ORD-101',
  totalAmount: 24,
  subtotal: 20,
  taxAmount: 4,
  paymentMethod: 'cash',
  status: 'completed',
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockGetPosTables.mockResolvedValue(tableList);
  // Default: no active tickets anywhere.
  mockPosGetOrders.mockResolvedValue([] as any);
});

// ─── TableView ──────────────────────────────────────────────
describe('TableView', () => {
  it('renders tables grouped by section with unassigned last', async () => {
    renderWithClient(<TableView />);
    await waitFor(() => {
      expect(screen.getByTestId('table-section-Terrace')).toBeInTheDocument();
    });
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getByTestId('table-card-T1')).toBeInTheDocument();
    expect(screen.getByTestId('table-card-B1')).toBeInTheDocument();
    expect(screen.getByTestId('tables-legend')).toBeInTheDocument();
  });

  it('shows empty state when there are no tables', async () => {
    mockGetPosTables.mockResolvedValue({ sections: [], total: 0 } as any);
    renderWithClient(<TableView />);
    await waitFor(() => {
      expect(screen.getByText('No tables yet')).toBeInTheDocument();
    });
  });

  it('shows error state', async () => {
    mockGetPosTables.mockRejectedValue(new Error('Tables load failed'));
    renderWithClient(<TableView />);
    await waitFor(() => {
      expect(screen.getByText('Tables load failed')).toBeInTheDocument();
    });
  });

  it('seats an available table through PATCH /pos-tables/:id/status', async () => {
    mockUpdatePosTableStatus.mockResolvedValue({ success: true, id: 'tbl_a', status: 'occupied' } as any);
    renderWithClient(<TableView />);
    await waitFor(() => {
      expect(screen.getByTestId('table-card-T1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('table-card-T1'));
    fireEvent.click(screen.getByTestId('table-seat-btn'));

    await waitFor(() => {
      // Hook maps vars → positional args on the api client.
      expect(mockUpdatePosTableStatus).toHaveBeenCalledWith('tbl_a', 'occupied');
    });
    expect(mockShowToast).toHaveBeenCalledWith('T1 → Occupied', 'success');
  });

  it('clears an occupied table back to available', async () => {
    mockUpdatePosTableStatus.mockResolvedValue({ success: true, id: 'tbl_b', status: 'available' } as any);
    renderWithClient(<TableView />);
    await waitFor(() => {
      expect(screen.getByTestId('table-card-T2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('table-card-T2'));
    fireEvent.click(screen.getByTestId('table-clear-btn'));

    await waitFor(() => {
      expect(mockUpdatePosTableStatus).toHaveBeenCalledWith('tbl_b', 'available');
    });
  });

  it('shows the active ticket bound to a selected occupied table', async () => {
    mockPosGetOrders.mockResolvedValue([dineInOrder] as any);
    mockPosGetOrder.mockResolvedValue({
      ...dineInOrder,
      tableId: 'tbl_b',
      kitchenStatus: 'preparing',
      items: [{ id: 'i1', productName: 'Koshary', quantity: 2, unitPrice: 12, totalAmount: 24 }],
    } as any);

    renderWithClient(<TableView />);
    await waitFor(() => {
      expect(screen.getByTestId('table-card-T2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('table-card-T2'));

    const panel = await screen.findByTestId('table-current-order');
    // Panel mounts instantly with a placeholder; wait for the hydrated ticket.
    await waitFor(() => {
      expect(panel.textContent).toContain('ORD-101');
    });
    expect(panel.textContent).toContain('$24.00');
    expect(panel.textContent).toContain('Koshary');
    expect(screen.getByTestId('table-clear-btn')).toBeInTheDocument();
  });

  it('adds a table via the form', async () => {
    mockCreatePosTable.mockResolvedValue({ success: true, id: 'tbl_new' } as any);
    renderWithClient(<TableView />);
    await waitFor(() => {
      expect(screen.getByTestId('toggle-add-table')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('toggle-add-table'));
    fireEvent.change(screen.getByLabelText('Table name'), { target: { value: 'T9' } });
    fireEvent.change(screen.getByLabelText('Table capacity'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Table section'), { target: { value: 'Terrace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Table' }));

    await waitFor(() => {
      expect(mockCreatePosTable).toHaveBeenCalledWith({ name: 'T9', capacity: 4, section: 'Terrace' });
    });
  });

  it('surfaces create failures as toasts instead of crashing', async () => {
    mockCreatePosTable.mockRejectedValue(new Error('Admin role required'));
    renderWithClient(<TableView />);
    await waitFor(() => {
      expect(screen.getByTestId('toggle-add-table')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('toggle-add-table'));
    fireEvent.change(screen.getByLabelText('Table name'), { target: { value: 'TX' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Table' }));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Admin role required', 'error');
    });
  });
});

// ─── KitchenView ────────────────────────────────────────────
describe('KitchenView', () => {
  function mockTicket(overrides: Partial<Record<string, unknown>>) {
    const row = { ...dineInOrder, ...overrides };
    mockPosGetOrders.mockResolvedValue([row] as any);
    mockPosGetOrder.mockResolvedValue(row as any);
  }

  it('renders all four kanban columns with counts', async () => {
    // The board grid only renders when there is at least one open ticket;
    // a fully empty board collapses to the "All caught up" empty state.
    mockTicket({ tableId: null, kitchenStatus: 'pending' });
    renderWithClient(<KitchenView />);
    await screen.findByTestId('kitchen-card-ord_1');

    expect(screen.getByTestId('kitchen-column-pending')).toBeInTheDocument();
    expect(screen.getByTestId('kitchen-column-confirmed')).toBeInTheDocument();
    expect(screen.getByTestId('kitchen-column-preparing')).toBeInTheDocument();
    expect(screen.getByTestId('kitchen-column-ready')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument(); // count badge on the pending column
  });

  it('files a confirmed dine-in ticket under its table name with items and age', async () => {
    mockTicket({
      tableId: 'tbl_b',
      kitchenStatus: 'confirmed',
      items: [{ id: 'i1', productName: 'Grilled Fish', quantity: 2, unitPrice: 12, totalAmount: 24 }],
    });
    mockGetPosTables.mockResolvedValue(tableList);

    renderWithClient(<KitchenView />);

    const card = await screen.findByTestId('kitchen-card-ord_1');
    expect(card.textContent).toContain('T2');
    expect(card.textContent).toContain('2× Grilled Fish');
    expect(card.textContent).toContain('5m ago');
    expect(screen.getByTestId('kitchen-column-confirmed').textContent).toContain('ORD-101');
  });

  it('labels unbound tickets as Takeout', async () => {
    mockTicket({ tableId: null, kitchenStatus: 'pending' });
    renderWithClient(<KitchenView />);
    const card = await screen.findByTestId('kitchen-card-ord_1');
    expect(card.textContent).toContain('Takeout');
  });

  it('advances a pending ticket to confirmed', async () => {
    mockTicket({ tableId: null, kitchenStatus: 'pending' });
    mockUpdateKitchenStatus.mockResolvedValue({ success: true, id: 'ord_1', status: 'confirmed' } as any);

    renderWithClient(<KitchenView />);
    fireEvent.click(await screen.findByTestId('kitchen-advance-ord_1'));

    await waitFor(() => {
      expect(mockUpdateKitchenStatus).toHaveBeenCalledWith('ord_1', 'confirmed');
    });
  });

  it('marks a ready ticket served (terminal step)', async () => {
    mockTicket({ tableId: 'tbl_b', kitchenStatus: 'ready' });
    mockUpdateKitchenStatus.mockResolvedValue({ success: true, id: 'ord_1', status: 'served' } as any);

    renderWithClient(<KitchenView />);
    const btn = await screen.findByTestId('kitchen-advance-ord_1');
    expect(btn.textContent).toBe('Mark Served');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockUpdateKitchenStatus).toHaveBeenCalledWith('ord_1', 'served');
    });
  });

  it('toasts transition failures (e.g. illegal 409)', async () => {
    mockTicket({ tableId: null, kitchenStatus: 'pending' });
    mockUpdateKitchenStatus.mockRejectedValue(new Error("Illegal kitchen status transition: 'pending' → 'ready'"));

    renderWithClient(<KitchenView />);
    fireEvent.click(await screen.findByTestId('kitchen-advance-ord_1'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        "Illegal kitchen status transition: 'pending' → 'ready'",
        'error',
      );
    });
  });

  it('shows empty state when no tickets are open', async () => {
    renderWithClient(<KitchenView />);
    await waitFor(() => {
      expect(screen.getByText('All caught up')).toBeInTheDocument();
    });
  });

  it('shows error state', async () => {
    mockPosGetOrders.mockRejectedValue(new Error('Kitchen load failed'));
    renderWithClient(<KitchenView />);
    await waitFor(() => {
      expect(screen.getByText('Kitchen load failed')).toBeInTheDocument();
    });
  });

  it('excludes served and canceled tickets from the board', async () => {
    const rows = [
      { ...dineInOrder, id: 'ord_served', kitchenStatus: 'served' },
      { ...dineInOrder, id: 'ord_canceled', kitchenStatus: 'canceled' },
      { ...dineInOrder, id: 'ord_active', kitchenStatus: 'preparing' },
    ];
    mockPosGetOrders.mockResolvedValue(rows as any);
    mockPosGetOrder.mockImplementation(async (id: unknown) =>
      rows.find((r) => r.id === id) as any,
    );

    renderWithClient(<KitchenView />);
    expect(await screen.findByTestId('kitchen-card-ord_active')).toBeInTheDocument();
    expect(screen.queryByTestId('kitchen-card-ord_served')).not.toBeInTheDocument();
    expect(screen.queryByTestId('kitchen-card-ord_canceled')).not.toBeInTheDocument();
  });
});
