import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { computeReceiptTotals, type PaymentRecord } from '@/lib/cashdesk';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Order } from '@/hooks/useAdminData';

interface PaymentReceiptProps {
  order: Order;
  /** Payments applied to this order (oldest first); the new batch is highlighted. */
  payments: PaymentRecord[];
  /** Ids of the just-recorded payment(s) — rendered with emphasis. */
  highlightPaymentIds?: string[];
  onClose: () => void;
}

// ─── Cash Desk Receipt (printable) ──────────────────────────────
// Phase 3.5: second instance of the POS ReceiptModal pattern
// (app/src/components/pos/views/ReceiptModal.tsx) — shared ui/Modal +
// `#payment-receipt-content` anchor + print stylesheet that hides everything
// except the receipt, thermal-style mono layout, window.print() footer.
export default function PaymentReceipt({
  order,
  payments,
  highlightPaymentIds = [],
  onClose,
}: PaymentReceiptProps) {
  const totals = computeReceiptTotals(order, payments);
  const guestName =
    [order.customerFirstName, order.customerLastName].filter(Boolean).join(' ') ||
    'N/A';
  const latest = [...payments].reverse().find((p) => p.createdAt) ?? payments[payments.length - 1];
  const receivedBy = latest?.receivedBy ?? null;
  const approvedBy = latest?.approvedBy ?? null;
  const stampedAt = latest?.createdAt ? new Date(latest.createdAt).toLocaleString() : new Date().toLocaleString();

  return (
    <Modal isOpen onClose={onClose} size="sm" testId="payment-receipt" showCloseButton={false}>
      <div id="payment-receipt-content">
        <style>{`
          @media print { body * { display: none !important; } #payment-receipt-content, #payment-receipt-content * { display: block !important; } }
        `}</style>
        <div className="font-mono text-xs space-y-1 text-center">
          <div className="text-lg font-bold">SinaiCamps</div>
          <div className="text-gray-500">Cash Desk Receipt</div>
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="text-left">Order: {order.reference || order.id}</div>
          <div className="text-left">Guest: {guestName}</div>
          <div className="text-left">
            Stay: {formatDate(String(order.checkInDate))} → {formatDate(String(order.checkOutDate))}
          </div>
          <div className="text-left">Room: {order.roomName || 'N/A'}</div>
          <div className="text-left">Guests: {order.numberOfPeople ?? 'N/A'}</div>
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="flex justify-between text-left">
            <span>Total</span>
            <span data-testid="receipt-total">{formatCurrency(totals.total)}</span>
          </div>
          <div className="flex justify-between text-left">
            <span>Previously paid</span>
            <span data-testid="receipt-paid-before">{formatCurrency(totals.paidBefore)}</span>
          </div>
          {payments.length > 0 && (
            <>
              <div className="border-t border-dashed border-gray-300 my-2" />
              <div className="text-left font-bold">Payments applied</div>
              {payments.map((p) => {
                const highlighted = highlightPaymentIds.includes(p.id);
                return (
                  <div key={p.id}>
                    <div
                      className={`flex justify-between text-left${highlighted ? ' font-bold' : ''}`}
                      data-testid={highlighted ? 'receipt-payment-new' : 'receipt-payment'}
                    >
                      <span>
                        {p.method}
                        {p.reference ? ` · ${p.reference}` : ''}
                      </span>
                      <span>{formatCurrency(Number(p.amount || 0))}</span>
                    </div>
                    {p.method === 'split' && (
                      <>
                        <div className="flex justify-between text-left pl-2">
                          <span>Cash</span>
                          <span>{formatCurrency(Number(p.amountCash || 0))}</span>
                        </div>
                        <div className="flex justify-between text-left pl-2">
                          <span>Card</span>
                          <span>{formatCurrency(Number(p.amountCard || 0))}</span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </>
          )}
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="flex justify-between text-left font-bold">
            <span>Paid total</span>
            <span data-testid="receipt-paid-total">{formatCurrency(totals.paidTotal)}</span>
          </div>
          <div className="flex justify-between text-left font-bold">
            <span>Balance due</span>
            <span data-testid="receipt-balance">{formatCurrency(totals.balance)}</span>
          </div>
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="text-left">Received by: {receivedBy || 'N/A'}</div>
          <div className="text-left">Approved by: {approvedBy || 'N/A'}</div>
          <div className="text-left">At: {stampedAt}</div>
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="text-gray-500">Thank you!</div>
        </div>
      </div>
      <div className="mt-4 flex gap-2 w-full">
        <Button variant="secondary" size="md" className="flex-1" onClick={() => window.print()}>
          Print
        </Button>
        <Button variant="primary" size="md" className="flex-1" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
