import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CashDeskPanel from '@/components/admin/CashDeskPanel';

const mockUseOrdersQuery = vi.fn();
const mockUseRoomsQuery = vi.fn();
const mockUseCampsQuery = vi.fn();
const mockUseCashDeskPayments = vi.fn();
const mockUseRecordPaymentMutation = vi.fn();
const mockUseOrderPaymentsQuery = vi.fn();

vi.mock('@/hooks/useQueryHooks', () => ({
  useOrdersQuery: (...args: unknown[]) => mockUseOrdersQuery(...args),
  useRoomsQuery: (...args: unknown[]) => mockUseRoomsQuery(...args),
  useCampsQuery: (...args: unknown[]) => mockUseCampsQuery(...args),
  useCashDeskPayments: (...args: unknown[]) => mockUseCashDeskPayments(...args),
  useRecordPaymentMutation: (...args: unknown[]) => mockUseRecordPaymentMutation(...args),
  useOrderPaymentsQuery: (...args: unknown[]) => mockUseOrderPaymentsQuery(...args),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/components/admin/RecordPaymentModal', () => ({
  default: () => <div data-testid="record-modal-stub" />,
}));

const todayIso = new Date().toISOString();

const mockOrders = [
  // outstanding, in scope
  { id: 'o1', campId: 'c1', roomId: 'r1', reference: 'REF001', orderStateId: 'confirmed', paymentStatus: 'pending', totalAmount: 500, amountPaid: 200, customerFirstName: 'John', customerLastName: 'Doe', checkInDate: '2026-09-01', checkOutDate: '2026-09-03' },
  // fully paid, in scope (feeds today's cash only)
  { id: 'o2', campId: 'c1', roomId: 'r1', reference: 'REF002', orderStateId: 'checked_out', paymentStatus: 'paid', totalAmount: 300, amountPaid: 300, customerFirstName: 'Jane', customerLastName: 'Smith', checkInDate: '2026-09-01', checkOutDate: '2026-09-02' },
  // outstanding but cancelled → excluded from outstanding
  { id: 'o3', campId: 'c1', roomId: 'r1', reference: 'REF003', orderStateId: 'cancelled', paymentStatus: 'pending', totalAmount: 100, amountPaid: 0, customerFirstName: 'Bob', customerLastName: 'Lee', checkInDate: '2026-09-01', checkOutDate: '2026-09-02' },
  // outstanding but other project → excluded (tenant scoping by campIds)
  { id: 'o4', campId: 'c2', roomId: 'r9', reference: 'REF004', orderStateId: 'confirmed', paymentStatus: 'pending', totalAmount: 700, amountPaid: 0, customerFirstName: 'Sam', customerLastName: 'Kim', checkInDate: '2026-09-01', checkOutDate: '2026-09-02' },
];

const paymentsByOrder: Record<string, unknown[]> = {
  o1: [
    { id: 'pay_1', orderId: 'o1', amount: 200, method: 'cash', receivedBy: 'cashier-1', createdAt: todayIso, projectTag: 'North Coast' },
  ],
  o2: [
    { id: 'pay_2', orderId: 'o2', amount: 220, method: 'split', amountCash: 120, amountCard: 100, receivedBy: 'cashier-2', createdAt: todayIso },
    { id: 'pay_3', orderId: 'o2', amount: 80, method: 'card', receivedBy: 'cashier-2', createdAt: '2026-01-05T10:00:00.000Z' },
  ],
};

function setup() {
  mockUseOrdersQuery.mockReturnValue({
    data: { data: mockOrders, total: 4 },
    isLoading: false,
    error: null,
    isFetching: false,
  });
  mockUseRoomsQuery.mockReturnValue({ data: [{ id: 'r1', name: 'Room 1', campId: 'c1' }], isLoading: false, error: null });
  mockUseCampsQuery.mockReturnValue({ data: [{ id: 'c1', name: 'Acacia' }], isLoading: false, error: null });
  mockUseCashDeskPayments.mockImplementation((ids: string[]) =>
    ids.map((id) => ({ data: paymentsByOrder[id] ?? [], isLoading: false, error: null })),
  );
  mockUseRecordPaymentMutation.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null });
  mockUseOrderPaymentsQuery.mockReturnValue({ data: [], isLoading: false, error: null });
}

describe('CashDeskPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists outstanding balances scoped to the active projects', () => {
    setup();
    render(<CashDeskPanel campIds={['c1']} camps={[{ id: 'c1', name: 'Acacia' } as never]} />);
    expect(screen.getByTestId('cashdesk-panel')).toBeInTheDocument();
    // Only o1 is outstanding + in scope + not cancelled → exactly one Record action.
    expect(screen.getAllByText('REF001').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Record')).toHaveLength(1);
    expect(screen.queryByText('REF003')).not.toBeInTheDocument();
    expect(screen.queryByText('REF004')).not.toBeInTheDocument();
    // Outstanding stats: 1 order, 300.00 total.
    expect(screen.getByTestId('cashdesk-stats')).toHaveTextContent('$300.00');
  });

  it("computes today's cash from cash + split cash legs (card excluded)", () => {
    setup();
    render(<CashDeskPanel campIds={['c1']} camps={[{ id: 'c1', name: 'Acacia' } as never]} />);
    // 200 (cash) + 120 (split cash leg) = 320; card-only and stale payments excluded.
    expect(screen.getByTestId('cashdesk-stats')).toHaveTextContent('$320.00');
    // Today's payments table shows the two current-day records.
    expect(screen.getByText('cashier-1')).toBeInTheDocument();
    expect(screen.getByText('cashier-2')).toBeInTheDocument();
  });

  it('shows the backend project tag when returned, else the camp name', () => {
    setup();
    render(<CashDeskPanel campIds={['c1']} camps={[{ id: 'c1', name: 'Acacia' } as never]} />);
    // pay_1 carries projectTag 'North Coast'.
    expect(screen.getByText('North Coast')).toBeInTheDocument();
    // pay_2 has no tag → falls back to the camp name.
    expect(screen.getAllByText('Acacia').length).toBeGreaterThanOrEqual(1);
  });

  it('shows an empty state with CTA when nothing is outstanding', () => {
    setup();
    mockUseOrdersQuery.mockReturnValue({
      data: { data: [mockOrders[1]], total: 1 },
      isLoading: false,
      error: null,
      isFetching: false,
    });
    const onNavigateToTab = vi.fn();
    render(
      <CashDeskPanel campIds={['c1']} camps={[{ id: 'c1', name: 'Acacia' } as never]} onNavigateToTab={onNavigateToTab} />,
    );
    expect(screen.getByText('No outstanding balances')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Go to Orders'));
    expect(onNavigateToTab).toHaveBeenCalledWith('reservations');
  });

  it('record action opens the payment modal', () => {
    setup();
    render(<CashDeskPanel campIds={['c1']} camps={[{ id: 'c1', name: 'Acacia' } as never]} />);
    fireEvent.click(screen.getByText('Record'));
    expect(screen.getByTestId('record-modal-stub')).toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    setup();
    mockUseOrdersQuery.mockReturnValue({ data: null, isLoading: true, error: null, isFetching: false });
    render(<CashDeskPanel campIds={['c1']} camps={[{ id: 'c1', name: 'Acacia' } as never]} />);
    expect(screen.getByTestId('cashdesk-panel')).toBeInTheDocument();
  });
});
