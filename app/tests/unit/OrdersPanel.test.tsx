import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OrdersPanel from '@/components/admin/OrdersPanel';

const mockUseOrdersQuery = vi.fn();
const mockUseCampsQuery = vi.fn();
const mockUseRoomsQuery = vi.fn();
const mockUseSaveOrderMutation = vi.fn();
const mockUseDeleteOrderMutation = vi.fn();

vi.mock('@/hooks/useQueryHooks', () => ({
  useOrdersQuery: (...args: unknown[]) => mockUseOrdersQuery(...args),
  useCampsQuery: (...args: unknown[]) => mockUseCampsQuery(...args),
  useRoomsQuery: (...args: unknown[]) => mockUseRoomsQuery(...args),
  useSaveOrderMutation: (...args: unknown[]) => mockUseSaveOrderMutation(...args),
  useDeleteOrderMutation: (...args: unknown[]) => mockUseDeleteOrderMutation(...args),
}));

vi.mock('@/lib/api', () => ({
  saveOrder: vi.fn().mockResolvedValue({}),
  deleteOrder: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (n: number) => `$${n.toFixed(2)}`,
  formatDate: (d: string) => d,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/components/ui/DataTable', () => ({
  DataTable: ({ data, columns, emptyMessage, actions }: { data: unknown[]; columns: { key: string; render?: (item: unknown) => React.ReactNode }[]; emptyMessage?: string; actions?: (row: unknown) => React.ReactNode }) => (
    <div data-testid="data-table">
      {data.length === 0 && emptyMessage && <p>{emptyMessage}</p>}
      {data.map((row: Record<string, unknown>, i: number) => (
        <div key={i} data-testid="data-row">
          <span>{String(row.reference || '')}</span>
          <span>{String(row.paymentStatus || '')}</span>
          {columns.map((col) => (
            <span key={col.key}>{col.render ? col.render(row) : String(row[col.key] ?? '')}</span>
          ))}
          {actions && <div>{actions(row)}</div>}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/ui/FormModal', () => ({
  FormModal: ({ open, title, children, onClose, onSubmit, submitLabel }: { open: boolean; title: string; children: React.ReactNode; onClose?: () => void; onSubmit?: () => void; submitLabel?: string }) =>
    open ? (
      <div data-testid="form-modal">
        <h2>{title}</h2>
        {children}
        {onClose && <button data-testid="modal-close" onClick={onClose}>Close</button>}
        {onSubmit && <button onClick={onSubmit}>{submitLabel || 'Submit'}</button>}
      </div>
    ) : null,
}));

vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, title, onConfirm, onCancel }: { open: boolean; title: string; onConfirm?: () => void; onCancel?: () => void }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <h2>{title}</h2>
        {onConfirm && <button onClick={onConfirm}>Confirm</button>}
        {onCancel && <button onClick={onCancel}>Cancel</button>}
      </div>
    ) : null,
}));

vi.mock('@/components/ui/Skeleton', () => ({
  TableSkeleton: () => <div data-testid="table-skeleton" />,
}));

vi.mock('@/components/ui/StatusTag', () => ({
  StatusTag: ({ status }: { status: string }) => <span>{status}</span>,
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: ({ text }: { text?: string }) => <div>{text}</div>,
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick, ...rest }: { children: React.ReactNode; onClick?: () => void; [key: string]: unknown }) => (
    <button onClick={onClick} {...rest}>{children}</button>
  ),
}));

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => <div {...rest}>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/Badge', () => ({
  Badge: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => <span {...rest}>{children}</span>,
}));

vi.mock('@/components/ui/Select', () => ({
  Select: ({ label, options, value, onChange, ...rest }: { label?: string; options: { value: string; label: string }[]; value?: string; onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void; [key: string]: unknown }) => (
    <div>
      {label && <label>{label}</label>}
      <select value={value} onChange={onChange} {...rest}>
        {options.map((opt: { value: string; label: string }) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  ),
}));

vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </div>
  ),
}));

const mockOrders = [
  { id: 'o1', campId: 'c1', roomId: 'r1', reference: 'REF001', orderStateId: 'pending', paymentStatus: 'paid', totalAmount: 500, customerFirstName: 'John', customerLastName: 'Doe', checkInDate: '2026-08-01', checkOutDate: '2026-08-03', stateName: 'pending' },
  { id: 'o2', campId: 'c1', roomId: 'r2', reference: 'REF002', orderStateId: 'confirmed', paymentStatus: 'paid', totalAmount: 300, customerFirstName: 'Jane', customerLastName: 'Smith', checkInDate: '2026-08-02', checkOutDate: '2026-08-04', stateName: 'confirmed' },
  { id: 'o3', campId: 'c1', roomId: 'r3', reference: 'REF003', orderStateId: 'checked_in', paymentStatus: 'unpaid', totalAmount: 200, customerFirstName: 'Ali', customerLastName: 'Hassan', checkInDate: '2026-08-03', checkOutDate: '2026-08-05', stateName: 'checked_in' },
];

const defaultHooks = {
  useOrdersQuery: { data: { data: mockOrders, total: 3 }, isLoading: false, error: null, isFetching: false },
  useCampsQuery: { data: [{ id: 'c1', name: 'Test Camp' }], isLoading: false, error: null },
  useRoomsQuery: { data: [{ id: 'r1', name: 'Room 1', campId: 'c1' }, { id: 'r2', name: 'Room 2', campId: 'c1' }, { id: 'r3', name: 'Room 3', campId: 'c1' }], isLoading: false, error: null },
  useSaveOrderMutation: { mutate: vi.fn((_args: unknown, opts?: { onSuccess?: () => void }) => { opts?.onSuccess?.(); }), isPending: false },
  useDeleteOrderMutation: { mutate: vi.fn((_args: unknown, opts?: { onSuccess?: () => void }) => { opts?.onSuccess?.(); }), isPending: false },
};

function setupMocks(overrides: Partial<typeof defaultHooks> = {}) {
  const merged = { ...defaultHooks, ...overrides };
  mockUseOrdersQuery.mockReturnValue(merged.useOrdersQuery);
  mockUseCampsQuery.mockReturnValue(merged.useCampsQuery);
  mockUseRoomsQuery.mockReturnValue(merged.useRoomsQuery);
  mockUseSaveOrderMutation.mockReturnValue(merged.useSaveOrderMutation);
  mockUseDeleteOrderMutation.mockReturnValue(merged.useDeleteOrderMutation);
}

describe('OrdersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders stats grid with order counts', () => {
    setupMocks();
    render(<OrdersPanel campIds={['c1']} camps={[{ id: 'c1', name: 'Test Camp' } as never]} />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });

  it('filter dropdown changes visible orders', () => {
    setupMocks();
    render(<OrdersPanel campIds={['c1']} camps={[{ id: 'c1', name: 'Test Camp' } as never]} />);
    const filterSelect = screen.getByDisplayValue('All Statuses');
    fireEvent.change(filterSelect, { target: { value: 'paid' } });
    const rows = screen.getAllByTestId('data-row');
    expect(rows).toHaveLength(2);
    expect(screen.getAllByText('REF001').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('REF002').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText('REF003')).toHaveLength(0);
  });

  it('view button opens detail modal', () => {
    setupMocks();
    render(<OrdersPanel campIds={['c1']} camps={[{ id: 'c1', name: 'Test Camp' } as never]} />);
    const viewButtons = screen.getAllByText('View');
    fireEvent.click(viewButtons[0]);
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();
    expect(screen.getByText('Reservation — REF001')).toBeInTheDocument();
    expect(screen.getAllByText('REF001').length).toBeGreaterThanOrEqual(1);
  });

  it('empty message shown when no orders match filter', () => {
    setupMocks({
      useOrdersQuery: {
        data: { data: [{ ...mockOrders[0], paymentStatus: 'paid' }], total: 1 },
        isLoading: false,
        error: null,
        isFetching: false,
      },
    });
    render(<OrdersPanel campIds={['c1']} camps={[{ id: 'c1', name: 'Test Camp' } as never]} />);
    const filterSelect = screen.getByDisplayValue('All Statuses');
    fireEvent.change(filterSelect, { target: { value: 'partial' } });
    expect(screen.getByText('No reservations found')).toBeInTheDocument();
  });

  it('state change modal opens with ORDER_STATES options', () => {
    setupMocks();
    render(<OrdersPanel campIds={['c1']} camps={[{ id: 'c1', name: 'Test Camp' } as never]} />);
    const stateButtons = screen.getAllByText('State');
    fireEvent.click(stateButtons[0]);
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();
    expect(screen.getByText('Change Order State')).toBeInTheDocument();
    expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Confirmed').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Checked In').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Checked Out')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.getByText('No Show')).toBeInTheDocument();
  });

  it('submits state change and closes modal', () => {
    setupMocks();
    render(<OrdersPanel campIds={['c1']} camps={[{ id: 'c1', name: 'Test Camp' } as never]} />);
    fireEvent.click(screen.getAllByText('State')[0]);
    expect(screen.getByText('Change Order State')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Update State'));
    expect(screen.queryByText('Change Order State')).not.toBeInTheDocument();
  });

  it('does not submit state change when no state selected', () => {
    setupMocks();
    render(<OrdersPanel campIds={['c1']} camps={[{ id: 'c1', name: 'Test Camp' } as never]} />);
    fireEvent.click(screen.getAllByText('State')[0]);
    const select = screen.getByDisplayValue('Pending');
    fireEvent.change(select, { target: { value: '' } });
    fireEvent.click(screen.getByText('Update State'));
    expect(screen.getByText('Change Order State')).toBeInTheDocument();
  });

  it('closes state modal via close button', () => {
    setupMocks();
    render(<OrdersPanel campIds={['c1']} camps={[{ id: 'c1', name: 'Test Camp' } as never]} />);
    fireEvent.click(screen.getAllByText('State')[0]);
    expect(screen.getByText('Change Order State')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByText('Change Order State')).not.toBeInTheDocument();
  });

  it('deletes a reservation with confirmation', () => {
    setupMocks();
    render(<OrdersPanel campIds={['c1']} camps={[{ id: 'c1', name: 'Test Camp' } as never]} />);
    fireEvent.click(screen.getAllByText('Del')[0]);
    expect(screen.getByText('Delete Reservation')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Confirm'));
    expect(screen.queryByText('Delete Reservation')).not.toBeInTheDocument();
  });

  it('cancels delete dialog', () => {
    setupMocks();
    render(<OrdersPanel campIds={['c1']} camps={[{ id: 'c1', name: 'Test Camp' } as never]} />);
    fireEvent.click(screen.getAllByText('Del')[0]);
    expect(screen.getByText('Delete Reservation')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Delete Reservation')).not.toBeInTheDocument();
  });

  it('closes detail modal via close and submit', () => {
    setupMocks();
    render(<OrdersPanel campIds={['c1']} camps={[{ id: 'c1', name: 'Test Camp' } as never]} />);
    fireEvent.click(screen.getAllByText('View')[0]);
    expect(screen.getByText('Reservation — REF001')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByText('Reservation — REF001')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByText('View')[0]);
    fireEvent.click(screen.getAllByText('Close')[1]);
    expect(screen.queryByText('Reservation — REF001')).not.toBeInTheDocument();
  });

  it('renders badge variants for all order states', () => {
    const allStates = [
      { id: 'o1', campId: 'c1', roomId: 'r1', reference: 'REF001', orderStateId: 'pending', paymentStatus: 'paid', totalAmount: 500, customerFirstName: 'John', customerLastName: 'Doe', checkInDate: '2026-08-01', checkOutDate: '2026-08-03', stateName: 'pending' },
      { id: 'o2', campId: 'c1', roomId: 'r2', reference: 'REF002', orderStateId: 'confirmed', paymentStatus: 'paid', totalAmount: 300, customerFirstName: 'Jane', customerLastName: 'Smith', checkInDate: '2026-08-02', checkOutDate: '2026-08-04', stateName: 'confirmed' },
      { id: 'o3', campId: 'c1', roomId: 'r3', reference: 'REF003', orderStateId: 'checked_in', paymentStatus: 'unpaid', totalAmount: 200, customerFirstName: 'Ali', customerLastName: 'Hassan', checkInDate: '2026-08-03', checkOutDate: '2026-08-05', stateName: 'checked_in' },
      { id: 'o4', campId: 'c1', roomId: 'r1', reference: 'REF004', orderStateId: 'checked_out', paymentStatus: 'paid', totalAmount: 100, customerFirstName: '', customerLastName: '', checkInDate: '2026-08-01', checkOutDate: '2026-08-02', stateName: 'checked_out' },
      { id: 'o5', campId: 'c1', roomId: 'r2', reference: 'REF005', orderStateId: 'cancelled', paymentStatus: 'unpaid', totalAmount: 50, customerFirstName: 'Bob', customerLastName: 'Lee', checkInDate: '2026-08-01', checkOutDate: '2026-08-02', stateName: 'cancelled' },
      { id: 'o6', campId: 'c1', roomId: 'r3', reference: 'REF006', orderStateId: 'no_show', paymentStatus: 'unpaid', totalAmount: 40, customerFirstName: 'Sam', customerLastName: 'Kim', checkInDate: '2026-08-01', checkOutDate: '2026-08-02' },
    ];
    setupMocks({
      useOrdersQuery: { data: { data: allStates, total: 6 }, isLoading: false, error: null, isFetching: false },
    });
    render(<OrdersPanel campIds={['c1']} camps={[{ id: 'c1', name: 'Test Camp' } as never]} />);
    expect(screen.getAllByTestId('data-row')).toHaveLength(6);
    expect(screen.getAllByText('N/A').length).toBeGreaterThanOrEqual(1);
  });

  it('renders N/A for unknown camp and room', () => {
    setupMocks({
      useCampsQuery: { data: [], isLoading: false, error: null },
      useOrdersQuery: { data: { data: [{ ...mockOrders[0], roomId: 'r99' }], total: 1 }, isLoading: false, error: null, isFetching: false },
    });
    render(<OrdersPanel campIds={['c1']} camps={[{ id: 'c1', name: 'Test Camp' } as never]} />);
    expect(screen.getAllByText('N/A').length).toBeGreaterThanOrEqual(2);
  });

  it('shows loading skeleton', () => {
    setupMocks({
      useOrdersQuery: { data: null, isLoading: true, error: null, isFetching: false },
    });
    render(<OrdersPanel campIds={['c1']} camps={[{ id: 'c1', name: 'Test Camp' } as never]} />);
    expect(screen.getByTestId('table-skeleton')).toBeInTheDocument();
  });

  it('shows updating indicator when refetching', () => {
    setupMocks({
      useOrdersQuery: { data: { data: mockOrders, total: 3 }, isLoading: false, error: null, isFetching: true },
    });
    render(<OrdersPanel campIds={['c1']} camps={[{ id: 'c1', name: 'Test Camp' } as never]} />);
    expect(screen.getByText('Updating...')).toBeInTheDocument();
  });
});
