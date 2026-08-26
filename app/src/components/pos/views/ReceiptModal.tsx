import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { Order, PosUser } from '../types';

type OrderItem = NonNullable<Order['items']>[number];

// ─── Receipt Modal (Thermal-style) ────────────────────────
// Phase 8: rebuilt on the shared ui/Modal — portal, focus trap, ESC +
// overlay-click dismissal come for free. The receipt body (print stylesheet,
// mono layout, `#receipt-content` anchor) and footer actions are unchanged.
export default function ReceiptModal({ order, user, onClose }: { order: Order; user: PosUser; onClose: () => void }) {
  return (
    <Modal isOpen onClose={onClose} size="sm" testId="receipt-modal" showCloseButton={false}>
      <div id="receipt-content">
        <style>{`
          @media print { body * { display: none !important; } #receipt-content, #receipt-content * { display: block !important; } }
        `}</style>
        <div className="font-mono text-xs space-y-1 text-center">
          <div className="text-lg font-bold">SinaiCamps</div>
          <div className="text-gray-500">POS Terminal Receipt</div>
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="text-left">Order: {order.orderNumber}</div>
          <div className="text-left">Cashier: {user.firstName} {user.lastName}</div>
          <div className="text-left">Date: {order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}</div>
          <div className="border-t border-dashed border-gray-300 my-2" />
          {order.items?.map((item: OrderItem, i: number) => (
            <div key={i} className="flex justify-between text-left">
              <span>{item.productName || item.productId} x{item.quantity}</span>
              <span>${Number(item.totalAmount).toFixed(2)}</span>
            </div>
          ))}
          {!order.items && <div className="text-left text-gray-500">Items list unavailable</div>}
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="flex justify-between text-left"><span>Subtotal</span><span>${Number(order.subtotal).toFixed(2)}</span></div>
          <div className="flex justify-between text-left"><span>Tax</span><span>${Number(order.taxAmount).toFixed(2)}</span></div>
          {'tipAmount' in order && Number(order.tipAmount) > 0 && (
            <div className="flex justify-between text-left"><span>Tip</span><span>${Number(order.tipAmount).toFixed(2)}</span></div>
          )}
          <div className="flex justify-between text-left font-bold"><span>Total</span><span>${Number(order.totalAmount).toFixed(2)}</span></div>
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="flex justify-between text-left"><span>Paid ({order.paymentMethod})</span><span>${Number(order.totalAmount).toFixed(2)}</span></div>
          {order.paymentMethod === 'split' && <>
            <div className="flex justify-between text-left pl-2"><span>Cash</span><span>${Number(order.amountCash || 0).toFixed(2)}</span></div>
            <div className="flex justify-between text-left pl-2"><span>Card</span><span>${Number(order.amountCard || 0).toFixed(2)}</span></div>
          </>}
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
