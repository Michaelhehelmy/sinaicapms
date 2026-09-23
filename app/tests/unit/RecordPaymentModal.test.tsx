import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RecordPaymentModal from '@/components/admin/RecordPaymentModal';

const mockMutate = vi.fn();
const mockUseRecordPaymentMutation = vi.fn();
const mockUseOrderPaymentsQuery = vi.fn();

vi.mock('@/hooks/useQueryHooks', () => ({
  useRecordPaymentMutation: (...args: unknown[]) => mockUseRecordPaymentMutation(...args),
  useOrderPaymentsQuery: (...args: unknown[]) => mockUseOrderPaymentsQuery(...args),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// The shared Select is a custom dropdown — stub it as a native select so
// method changes are drivable with fireEvent.change.
vi.mock('@/components/ui/Select', () => ({
  Select: ({ label, options, value, onChange, ...rest }: {
    label?: string;
    options: { value: string; label: string }[];
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    [key: string]: unknown;
  }) => (
    <div>
      {label && <label>{label}</label>}
      <select value={value} onChange={onChange} {...rest}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  ),
}));

const order = {
  id: 'o1',
  tenantId: 't1',
  campId: 'c1',
  roomId: 'r1',
  customerId: null,
  orderStateId: 'confirmed',
  checkInDate: '2026-09-01',
  checkOutDate: '2026-09-03',
  numberOfPeople: 2,
  totalAmount: 500,
  amountPaid: 200,
  paymentMethod: null,
  paymentStatus: 'pending',
  reference: 'REF001',
  customerFirstName: 'John',
  customerLastName: 'Doe',
  roomName: 'Room 1',
  stateName: 'confirmed',
};

function setup(mutationOverrides = {}) {
  mockUseRecordPaymentMutation.mockReturnValue({
    mutate: mockMutate,
    isPending: false,
    error: null,
    ...mutationOverrides,
  });
  mockUseOrderPaymentsQuery.mockReturnValue({ data: [], isLoading: false, error: null });
}

describe('RecordPaymentModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefills the amount with the outstanding balance', () => {
    setup();
    render(<RecordPaymentModal order={order as never} open onClose={() => {}} />);
    expect(screen.getByTestId('record-payment-form')).toBeInTheDocument();
    expect(screen.getByTestId('record-payment-balance')).toHaveTextContent('$300.00');
    expect(screen.getByTestId('record-payment-amount')).toHaveValue(300);
  });

  it('blocks overpayment client-side and disables submit', () => {
    setup();
    render(<RecordPaymentModal order={order as never} open onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('record-payment-amount'), { target: { value: '400' } });
    expect(screen.getByTestId('record-payment-error')).toHaveTextContent(
      'exceeds the outstanding balance of 300.00',
    );
    expect(screen.getByTestId('modal-save')).toBeDisabled();
  });

  it('rejects zero amounts', () => {
    setup();
    render(<RecordPaymentModal order={order as never} open onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('record-payment-amount'), { target: { value: '0' } });
    expect(screen.getByTestId('record-payment-error')).toHaveTextContent('greater than zero');
  });

  it('shows split leg inputs and requires them to sum to the amount', () => {
    setup();
    render(<RecordPaymentModal order={order as never} open onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('record-payment-method'), { target: { value: 'split' } });
    expect(screen.getByTestId('record-payment-cash')).toBeInTheDocument();
    expect(screen.getByTestId('record-payment-card')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('record-payment-amount'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('record-payment-cash'), { target: { value: '60' } });
    fireEvent.change(screen.getByTestId('record-payment-card'), { target: { value: '30' } });
    expect(screen.getByTestId('record-payment-error')).toHaveTextContent('must equal');
    expect(screen.getByTestId('modal-save')).toBeDisabled();

    fireEvent.change(screen.getByTestId('record-payment-card'), { target: { value: '40' } });
    expect(screen.queryByTestId('record-payment-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('modal-save')).not.toBeDisabled();
  });

  it('submits wiring: mutate called with id + input on valid form', () => {
    setup();
    render(<RecordPaymentModal order={order as never} open onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('record-payment-reference'), { target: { value: 'V-9' } });
    fireEvent.click(screen.getByTestId('modal-save'));
    expect(mockMutate).toHaveBeenCalledTimes(1);
    const [args] = mockMutate.mock.calls[0] as [{ id: string; input: Record<string, unknown> }, unknown];
    expect(args.id).toBe('o1');
    expect(args.input).toMatchObject({ amount: 300, method: 'cash', reference: 'V-9' });
  });

  it('sends split legs in one call', () => {
    setup();
    render(<RecordPaymentModal order={order as never} open onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('record-payment-method'), { target: { value: 'split' } });
    fireEvent.change(screen.getByTestId('record-payment-amount'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('record-payment-cash'), { target: { value: '60' } });
    fireEvent.change(screen.getByTestId('record-payment-card'), { target: { value: '40' } });
    fireEvent.click(screen.getByTestId('modal-save'));
    const [args] = mockMutate.mock.calls[0] as [{ id: string; input: Record<string, unknown> }, unknown];
    expect(args.input).toMatchObject({ amount: 100, method: 'split', amountCash: 60, amountCard: 40 });
  });

  it('surfaces server errors without closing', () => {
    setup({ error: new Error('Overpayment rejected') });
    render(<RecordPaymentModal order={order as never} open onClose={() => {}} />);
    expect(screen.getByTestId('record-payment-server-error')).toHaveTextContent(
      'Overpayment rejected',
    );
    expect(screen.getByTestId('record-payment-form')).toBeInTheDocument();
  });

  it('flips to the printable receipt on success', () => {
    mockUseRecordPaymentMutation.mockReturnValue({ mutate: mockMutate, isPending: false, error: null });
    mockUseOrderPaymentsQuery.mockReturnValue({ data: [], isLoading: false, error: null });
    mockMutate.mockImplementationOnce((_args: unknown, opts?: { onSuccess?: (r: unknown) => void }) => {
      opts?.onSuccess?.({
        success: true,
        payment: {
          id: 'pay_1',
          orderId: 'o1',
          amount: 300,
          method: 'cash',
          receivedBy: ' cashier-1',
          createdAt: new Date().toISOString(),
        },
        order: { id: 'o1', totalAmount: 500, amountPaid: 500, paymentStatus: 'paid' },
      });
    });
    render(<RecordPaymentModal order={order as never} open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('modal-save'));
    expect(screen.getByTestId('payment-receipt')).toBeInTheDocument();
    expect(screen.getByTestId('receipt-payment-new')).toBeInTheDocument();
    expect(screen.getByTestId('receipt-balance')).toHaveTextContent('$0.00');
  });

  it('renders nothing when closed', () => {
    setup();
    const { container } = render(<RecordPaymentModal order={order as never} open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
