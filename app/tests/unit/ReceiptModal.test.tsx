import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReceiptModal from '@/components/pos/views/ReceiptModal';
import type { Order, PosUser } from '@/components/pos/types';

const order: Order = {
  id: 'o1',
  orderNumber: 'ORD-1001',
  totalAmount: 23,
  subtotal: 20,
  taxAmount: 3,
  paymentMethod: 'cash',
  status: 'completed',
  createdAt: '2026-01-01T10:00:00Z',
  items: [
    { id: 'i1', productName: 'Sandwich', quantity: 2, unitPrice: 5, totalAmount: 10 },
    { id: 'i2', productName: 'Juice', quantity: 1, unitPrice: 3, totalAmount: 3 },
  ],
};

const user: PosUser = {
  id: 1,
  username: 'ahmed',
  email: 'ahmed@example.com',
  firstName: 'Ahmed',
  lastName: 'Hassan',
  role: 'cashier',
  organizationId: 1,
  storeId: null,
};

describe('ReceiptModal', () => {
  it('renders order and user details, items, and totals', () => {
    const onClose = vi.fn();
    render(<ReceiptModal order={order} user={user} onClose={onClose} />);

    expect(screen.getByTestId('receipt-modal')).toBeInTheDocument();
    expect(screen.getByText(/ORD-1001/)).toBeInTheDocument();
    expect(screen.getByText(/Ahmed Hassan/)).toBeInTheDocument();
    expect(screen.getByText(/Sandwich x2/)).toBeInTheDocument();
    expect(screen.getByText(/Juice x1/)).toBeInTheDocument();
    expect(screen.getAllByText('$23.00').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Paid \(cash\)/)).toBeInTheDocument();
  });

  it('renders split payment cash/card breakdown when paymentMethod is split', () => {
    const onClose = vi.fn();
    const splitOrder: Order = {
      ...order,
      paymentMethod: 'split',
      amountCash: 12,
      amountCard: 11,
    };
    render(<ReceiptModal order={splitOrder} user={user} onClose={onClose} />);

    expect(screen.getByText(/Paid \(split\)/)).toBeInTheDocument();
    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.getByText('Card')).toBeInTheDocument();
    expect(screen.getByText('$12.00')).toBeInTheDocument();
    expect(screen.getByText('$11.00')).toBeInTheDocument();
  });

  it('renders fallback when items are missing', () => {
    const onClose = vi.fn();
    render(<ReceiptModal order={{ ...order, items: undefined }} user={user} onClose={onClose} />);
    expect(screen.getByText('Items list unavailable')).toBeInTheDocument();
  });

  it('closes when clicking the backdrop or the Close button', () => {
    const onClose = vi.fn();
    render(<ReceiptModal order={order} user={user} onClose={onClose} />);

    fireEvent.click(screen.getByTestId('receipt-modal'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('does not close when clicking inside the modal content', () => {
    const onClose = vi.fn();
    render(<ReceiptModal order={order} user={user} onClose={onClose} />);

    fireEvent.click(screen.getByText('SinaiCamps'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls window.print when clicking Print', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<ReceiptModal order={order} user={user} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Print'));
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });
});
