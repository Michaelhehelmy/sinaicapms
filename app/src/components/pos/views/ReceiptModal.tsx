import { Button } from '@/components/ui/Button';
import type { Order, PosUser } from '../types';

// ─── Receipt Modal (Thermal-style) ────────────────────────
export default function ReceiptModal({ order, user, onClose }: { order: Order; user: PosUser; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose} data-testid="receipt-modal">
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="p-6" id="receipt-content">
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
            {order.items?.map((item: any, i: number) => (
              <div key={i} className="flex justify-between text-left">
                <span>{item.productName || item.productId} x{item.quantity}</span>
                <span>${Number(item.totalAmount).toFixed(2)}</span>
              </div>
            ))}
            {!order.items && <div className="text-left text-gray-500">Items list unavailable</div>}
            <div className="border-t border-dashed border-gray-300 my-2" />
            <div className="flex justify-between text-left"><span>Subtotal</span><span>${Number(order.subtotal).toFixed(2)}</span></div>
            <div className="flex justify-between text-left"><span>Tax</span><span>${Number(order.taxAmount).toFixed(2)}</span></div>
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
        <div className="px-6 pb-4 flex gap-2">
          <Button variant="secondary" size="md" className="flex-1" onClick={() => window.print()}>
            Print
          </Button>
          <Button variant="primary" size="md" className="flex-1" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
