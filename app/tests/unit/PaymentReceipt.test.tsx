import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PaymentReceipt from '@/components/admin/PaymentReceipt';

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
  amountPaid: 350,
  paymentMethod: 'cash',
  paymentStatus: 'pending',
  reference: 'REF001',
  customerFirstName: 'John',
  customerLastName: 'Doe',
  customerEmail: 'john@example.com',
  customerPhone: '+201000000000',
  roomName: 'Sea View',
  stateName: 'confirmed',
  notes: null,
};

const payments = [
  {
    id: 'pay_0',
    orderId: 'o1',
    amount: 200,
    method: 'cash',
    receivedBy: 'cashier-1',
    approvedBy: 'manager-1',
    createdAt: '2026-09-20T10:00:00.000Z',
  },
  {
    id: 'pay_1',
    orderId: 'o1',
    amount: 150,
    method: 'split',
    amountCash: 100,
    amountCard: 50,
    reference: 'V-9',
    receivedBy: 'cashier-2',
    approvedBy: 'manager-1',
    createdAt: '2026-09-23T10:00:00.000Z',
  },
];

describe('PaymentReceipt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders correct totals math (total / paid-before / paid-total / balance)', () => {
    render(
      <PaymentReceipt
        order={order as never}
        payments={payments as never}
        highlightPaymentIds={['pay_1']}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('payment-receipt')).toBeInTheDocument();
    expect(screen.getByTestId('receipt-total')).toHaveTextContent('$500.00');
    // amountPaid (350) minus this batch (350) → paid-before 0.
    expect(screen.getByTestId('receipt-paid-before')).toHaveTextContent('$0.00');
    expect(screen.getByTestId('receipt-paid-total')).toHaveTextContent('$350.00');
    expect(screen.getByTestId('receipt-balance')).toHaveTextContent('$150.00');
  });

  it('lists payments applied with split legs and highlights the new batch', () => {
    render(
      <PaymentReceipt
        order={order as never}
        payments={payments as never}
        highlightPaymentIds={['pay_1']}
        onClose={() => {}}
      />,
    );
    expect(screen.getAllByTestId('receipt-payment')).toHaveLength(1);
    expect(screen.getByTestId('receipt-payment-new')).toHaveTextContent('V-9');
    expect(screen.getByTestId('receipt-payment-new')).toHaveTextContent('$150.00');
  });

  it('shows received/approved by plus timestamp', () => {
    render(
      <PaymentReceipt
        order={order as never}
        payments={payments as never}
        highlightPaymentIds={['pay_1']}
        onClose={() => {}}
      />,
    );
    // Latest stamped payment drives the footer attribution.
    expect(screen.getByText(/Received by: cashier-2/)).toBeInTheDocument();
    expect(screen.getByText(/Approved by: manager-1/)).toBeInTheDocument();
  });

  it('print button calls window.print, close button closes', () => {
    const printSpy = vi.fn();
    Object.defineProperty(window, 'print', {
      value: printSpy,
      writable: true,
      configurable: true,
    });
    const onClose = vi.fn();
    render(
      <PaymentReceipt order={order as never} payments={payments as never} onClose={onClose} />,
    );
    fireEvent.click(screen.getByText('Print'));
    expect(printSpy).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
