import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ServiceBookingsPanel from '@/components/admin/ServiceBookingsPanel';

const { mockShowToast } = vi.hoisted(() => ({ mockShowToast: vi.fn() }));

// ── Mutable API mocks (re-assigned per test via the exported vi.mocked fns) ──
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (v: number) => `$${v.toFixed(2)}`,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/lib/api', () => ({
  getServiceBookings: vi.fn(),
  getServiceItems: vi.fn(),
  createServiceBooking: vi.fn(),
  updateBookingStatus: vi.fn(),
  assignServiceWorker: vi.fn(),
  getPosUsers: vi.fn(),
}));

import * as api from '@/lib/api';
const mockGetServiceBookings = vi.mocked(api.getServiceBookings);
const mockGetServiceItems = vi.mocked(api.getServiceItems);
const mockCreateServiceBooking = vi.mocked(api.createServiceBooking);
const mockUpdateBookingStatus = vi.mocked(api.updateBookingStatus);
const mockAssignServiceWorker = vi.mocked(api.assignServiceWorker);
const mockGetPosUsers = vi.mocked(api.getPosUsers);

// ── Shared UI mocks (mirror services-promos-billing.test.tsx) ──────────
vi.mock('@/components/ui/Card', () => ({
  Card: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => (
    <div {...rest}>{children}</div>
  ),
  CardHeader: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => (
    <div {...rest}>{children}</div>
  ),
  CardBody: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => (
    <div {...rest}>{children}</div>
  ),
}));

vi.mock('@/components/ui/Badge', () => ({
  Badge: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => (
    <span data-testid="badge" {...rest}>{children}</span>
  ),
}));

vi.mock('@/components/ui/DataTable', () => ({
  DataTable: ({
    data,
    columns,
    actions,
  }: {
    data: unknown[];
    columns: { key: string; header: string; render?: (item: unknown) => React.ReactNode }[];
    actions?: (row: unknown) => React.ReactNode;
  }) => (
    <div data-testid="data-table">
      {data.map((row: Record<string, unknown>, i: number) => (
        <div key={i} data-testid="data-row">
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
  FormModal: ({
    open,
    title,
    children,
    onClose,
    onSubmit,
    submitLabel,
    submitDisabled,
  }: {
    open: boolean;
    title: string;
    children: React.ReactNode;
    onClose?: () => void;
    onSubmit?: () => void;
    submitLabel?: string;
    submitDisabled?: boolean;
  }) =>
    open ? (
      <div data-testid="form-modal">
        <h2>{title}</h2>
        {children}
        {onClose && <button data-testid="modal-close" onClick={onClose}>Close</button>}
        {onSubmit && (
          <button data-testid="modal-submit" onClick={onSubmit} disabled={submitDisabled}>
            {submitLabel || 'Submit'}
          </button>
        )}
      </div>
    ) : null,
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: ({ text }: { text?: string }) => <div data-testid="loading-spinner">{text}</div>,
}));

vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </div>
  ),
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
}));

vi.mock('@/components/ui/Input', () => ({
  Input: ({
    label,
    value,
    onChange,
    placeholder,
    type,
  }: {
    label?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    type?: string;
  }) => (
    <div>
      {label && <label>{label}</label>}
      <input
        type={type}
        value={value ?? ''}
        onChange={onChange}
        placeholder={placeholder}
        data-testid={label ? `input-${label}` : 'input'}
      />
    </div>
  ),
}));

vi.mock('@/components/ui/Select', () => ({
  Select: ({
    label,
    options,
    value,
    onChange,
    placeholder,
  }: {
    label?: string;
    options: { value: string; label: string }[];
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    placeholder?: string;
  }) => (
    <div>
      {label && <label>{label}</label>}
      <select value={value} onChange={onChange} data-testid={label ? `select-${label}` : 'select'}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt: { value: string; label: string }) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  ),
}));

// ── Representative mock data ──────────────────────────────────────────
const mockItems = [
  { id: 'si1', name: 'Emergency Plumbing', service_definition_id: 'sd1', base_price: 50, status: 'active' },
  { id: 'si2', name: 'Rewire', service_definition_id: 'sd2', base_price: 0, status: 'inactive' },
];

const mockBookings = [
  { id: 'sb1', item_name: 'Emergency Plumbing', customer_name: 'John', scheduled_date: '2025-07-01T00:00:00Z', status: 'pending', service_item_id: 'si1', assigned_worker_id: 'w1' },
  { id: 'sb2', item_name: null, customer_name: '', scheduled_date: null, status: 'mystery_status', service_item_id: 'si2', assigned_worker_id: 'missing-worker' },
];

const mockStaff = { data: [{ id: 'w1', firstName: 'Ali', lastName: 'Khan', isActive: 1 }] };

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServiceBookings.mockResolvedValue(mockBookings as never);
  mockGetServiceItems.mockResolvedValue(mockItems as never);
  mockGetPosUsers.mockResolvedValue(mockStaff as never);
});

// ══════════════════════════════════════════════════════════════════════
// ServiceBookingsPanel — additional coverage
// ══════════════════════════════════════════════════════════════════════
describe('ServiceBookingsPanel extra coverage', () => {
  it('filters bookings by status, re-querying the API', async () => {
    mockGetServiceBookings.mockResolvedValue(mockBookings as never);
    renderWithQuery(<ServiceBookingsPanel />);
    await waitFor(() => expect(screen.getByTestId('data-table')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('select-Filter by status'), { target: { value: 'confirmed' } });

    await waitFor(() => {
      expect(mockGetServiceBookings).toHaveBeenCalledWith('confirmed');
    });
  });

  it('sends full booking fields (phone, date, notes) on create', async () => {
    mockGetServiceBookings.mockResolvedValue([] as never);
    mockCreateServiceBooking.mockResolvedValue({ id: 'sb_new', success: true } as never);
    renderWithQuery(<ServiceBookingsPanel />);
    await waitFor(() => expect(screen.getByTestId('add-booking-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('add-booking-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Create Booking' })));

    fireEvent.change(screen.getByTestId('select-Service Item *'), { target: { value: 'si1' } });
    fireEvent.change(screen.getByTestId('input-Customer Name'), { target: { value: 'Jane' } });
    // Previously-uncovered field handlers:
    fireEvent.change(screen.getByTestId('input-Customer Phone'), { target: { value: '+20 100 000 0000' } });
    fireEvent.change(screen.getByTestId('input-Scheduled Date'), { target: { value: '2025-08-15' } });
    fireEvent.change(screen.getByTestId('input-Notes'), { target: { value: 'Ask for receipt' } });

    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockCreateServiceBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          service_item_id: 'si1',
          customer_name: 'Jane',
          customer_phone: '+20 100 000 0000',
          scheduled_date: '2025-08-15',
          notes: 'Ask for receipt',
        }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Booking created.', 'success');
    });
  });

  it('closes the create booking modal via onClose', async () => {
    mockGetServiceBookings.mockResolvedValue([] as never);
    renderWithQuery(<ServiceBookingsPanel />);
    await waitFor(() => expect(screen.getByTestId('add-booking-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('add-booking-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Create Booking' })));

    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Create Booking' })).not.toBeInTheDocument());
    expect(mockCreateServiceBooking).not.toHaveBeenCalled();
  });

  it('shows error toast when updating booking status fails', async () => {
    mockGetServiceBookings.mockResolvedValue(mockBookings as never);
    mockUpdateBookingStatus.mockRejectedValue(new Error('status failure'));
    renderWithQuery(<ServiceBookingsPanel />);
    await waitFor(() => expect(screen.getByTestId('data-table')).toBeInTheDocument());

    const rowSelects = screen.getAllByTestId('select');
    fireEvent.change(rowSelects[0], { target: { value: 'completed' } });

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Error: status failure', 'error'));
  });

  it('renders the assigned worker name in the worker column', async () => {
    mockGetServiceBookings.mockResolvedValue([
      { id: 'sb1', item_name: 'Emergency Plumbing', customer_name: 'John', scheduled_date: '2025-07-01T00:00:00Z', status: 'pending', service_item_id: 'si1', assigned_worker_id: 'w1' },
    ] as never);
    mockGetPosUsers.mockResolvedValue(mockStaff as never);
    renderWithQuery(<ServiceBookingsPanel />);
    await waitFor(() => expect(screen.getByTestId('data-table')).toBeInTheDocument());
    // The worker column resolves the matching staff member to "Ali Khan".
    expect(screen.getByText('Ali Khan')).toBeInTheDocument();
    expect(screen.queryByText('Unassigned')).not.toBeInTheDocument();
  });

  it('renders raw worker id when the worker is not in the staff list', async () => {
    mockGetServiceBookings.mockResolvedValue([
      { id: 'sb1', item_name: 'Emergency Plumbing', customer_name: 'John', scheduled_date: '2025-07-01T00:00:00Z', status: 'pending', service_item_id: 'si1', assigned_worker_id: 'no-such-worker' },
    ] as never);
    mockGetPosUsers.mockResolvedValue({ data: [] } as never);
    renderWithQuery(<ServiceBookingsPanel />);
    await waitFor(() => expect(screen.getByTestId('data-table')).toBeInTheDocument());
    expect(screen.getByText('no-such-worker')).toBeInTheDocument();
  });

  it('closes the assign worker modal via onClose', async () => {
    mockGetServiceBookings.mockResolvedValue(mockBookings as never);
    renderWithQuery(<ServiceBookingsPanel />);
    await waitFor(() => expect(screen.getByTestId('data-table')).toBeInTheDocument());

    fireEvent.click(screen.getAllByText('Assign Worker')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Assign Worker' })));

    fireEvent.click(screen.getByTestId('modal-close'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Assign Worker' })).not.toBeInTheDocument());
  });

  it('does not assign when no worker is selected', async () => {
    mockGetServiceBookings.mockResolvedValue(mockBookings as never);
    renderWithQuery(<ServiceBookingsPanel />);
    await waitFor(() => expect(screen.getByTestId('data-table')).toBeInTheDocument());

    fireEvent.click(screen.getAllByText('Assign Worker')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Assign Worker' })));

    // Submit without selecting a worker -> handleAssign early-returns, no API call.
    fireEvent.click(screen.getByTestId('modal-submit'));
    expect(mockAssignServiceWorker).not.toHaveBeenCalled();
  });

  it('renders unknown booking status with a neutral badge', async () => {
    mockGetServiceBookings.mockResolvedValue([
      { id: 'sb2', item_name: 'Rewire', customer_name: '', scheduled_date: null, status: 'mystery_status', service_item_id: 'si2' },
    ] as never);
    renderWithQuery(<ServiceBookingsPanel />);
    await waitFor(() => expect(screen.getByTestId('data-table')).toBeInTheDocument());
    // Unknown status falls back to its raw string via a neutral variant badge.
    expect(screen.getByText('mystery_status')).toBeInTheDocument();
  });

  it('renders a dash for missing scheduled date and empty item fallback', async () => {
    mockGetServiceBookings.mockResolvedValue([
      { id: 'sb2', item_name: null, customer_name: '', scheduled_date: null, status: 'pending', service_item_id: 'si2' },
    ] as never);
    renderWithQuery(<ServiceBookingsPanel />);
    await waitFor(() => expect(screen.getByTestId('data-table')).toBeInTheDocument());
    // scheduled_date slice guarded by null -> renders "-", and customer_name falls back to "-".
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2);
  });

  it('renders "No customer" in the assign modal for a booking without a customer', async () => {
    mockGetServiceBookings.mockResolvedValue([
      { id: 'sb2', item_name: null, customer_name: '', scheduled_date: null, status: 'pending', service_item_id: 'si2' },
    ] as never);
    renderWithQuery(<ServiceBookingsPanel />);
    await waitFor(() => expect(screen.getByTestId('data-table')).toBeInTheDocument());

    fireEvent.click(screen.getAllByText('Assign Worker')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Assign Worker' })));
    expect(screen.getByText(/No customer/)).toBeInTheDocument();
  });

  it('shows pending state on the create submit button while creating', async () => {
    mockGetServiceBookings.mockResolvedValue([] as never);
    // Never-resolving promise keeps the create mutation pending.
    mockCreateServiceBooking.mockReturnValue(new Promise(() => {}) as never);
    renderWithQuery(<ServiceBookingsPanel />);
    await waitFor(() => expect(screen.getByTestId('add-booking-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('add-booking-btn'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Create Booking' })));
    fireEvent.change(screen.getByTestId('select-Service Item *'), { target: { value: 'si1' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(screen.getByText('Creating...')).toBeInTheDocument());
    expect(screen.getByTestId('modal-submit')).toBeDisabled();
  });

  it('shows pending state on the assign submit button while assigning', async () => {
    mockGetServiceBookings.mockResolvedValue(mockBookings as never);
    mockAssignServiceWorker.mockReturnValue(new Promise(() => {}) as never);
    renderWithQuery(<ServiceBookingsPanel />);
    await waitFor(() => expect(screen.getByTestId('data-table')).toBeInTheDocument());

    fireEvent.click(screen.getAllByText('Assign Worker')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Assign Worker' })));
    fireEvent.change(screen.getByTestId('select-Select Worker'), { target: { value: 'w1' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => expect(screen.getByText('Assigning...')).toBeInTheDocument());
    expect(screen.getByTestId('modal-submit')).toBeDisabled();
  });

  it('assigns a worker and shows success toast', async () => {
    mockGetServiceBookings.mockResolvedValue(mockBookings as never);
    mockAssignServiceWorker.mockResolvedValue({ success: true } as never);
    renderWithQuery(<ServiceBookingsPanel />);
    await waitFor(() => expect(screen.getByTestId('data-table')).toBeInTheDocument());

    fireEvent.click(screen.getAllByText('Assign Worker')[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Assign Worker' })));
    fireEvent.change(screen.getByTestId('select-Select Worker'), { target: { value: 'w1' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockAssignServiceWorker).toHaveBeenCalledWith('sb1', 'w1');
      expect(mockShowToast).toHaveBeenCalledWith('Worker assigned.', 'success');
    });
  });
});
