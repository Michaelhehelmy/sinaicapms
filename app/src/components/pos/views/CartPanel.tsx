import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import * as apiClient from '@/lib/api';
import { posUrl } from '@/lib/posUrl';
import ReceiptModal from './ReceiptModal';
import type { CartItem, Order, PosUser } from '../types';

// ─── Cart Panel ────────────────────────────────────────────
export default function CartPanel({ cart, setCart, onCheckout, user }: { cart: CartItem[]; setCart: React.Dispatch<React.SetStateAction<CartItem[]>>; onCheckout: () => void; user: PosUser }) {
  const [paying, setPaying] = useState(false);
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'split'>('cash');
  const [splitCash, setSplitCash] = useState('');
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const { showToast } = useToast();

  function updateQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => i.product.id === productId ? { ...i, quantity: i.quantity + delta } : i)
        .filter((i) => i.quantity > 0)
    );
  }

  const subtotal = cart.reduce((sum, i) => sum + i.product.sellingPrice * i.quantity, 0);
  const tax = subtotal * 0.1;
  const total = subtotal + tax;

  const splitCashAmt = payMethod === 'split' ? (parseFloat(splitCash) || 0) : 0;
  const splitCardAmt = Math.round((total - splitCashAmt) * 100) / 100;

  async function handleCheckout() {
    if (cart.length === 0 || paying) return;
    setPaying(true);
    try {
      const body: any = {
        items: cart.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
        paymentMethod: payMethod,
      };
      if (payMethod === 'split') {
        body.amountCash = splitCashAmt;
        body.amountCard = splitCardAmt;
      }
      const res = await apiClient.posCreateOrder(body);
      setCart([]);
      onCheckout();
      // Navigate to orders page after successful checkout
      window.location.href = posUrl('/pos/orders');
    } catch (err: any) {
      showToast(err.message || 'Checkout failed', 'error');
    } finally {
      setPaying(false);
    }
  }

  // v8 ignore start -- unreachable defensive branch: `receiptOrder` is only ever
  // set to null (checkout navigates to /pos/orders instead of rendering a receipt)
  if (receiptOrder) {
    return (
      <ReceiptModal order={receiptOrder} user={user} onClose={() => { setReceiptOrder(null); window.location.href = posUrl('/pos/orders'); }} />
    );
  }
  // v8 ignore stop

  return (
    <div className="w-full sm:w-80 bg-white border-t sm:border-t-0 sm:border-l border-gray-200 flex flex-col shrink-0 max-h-[50vh] sm:max-h-none" data-testid="pos-cart">
      <div className="px-5 py-4 border-b border-gray-200">
        <h3 className="font-bold text-gray-900">Current Order</h3>
        <div className="text-xs text-gray-500 mt-0.5">{cart.length} item(s)</div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
        {cart.length === 0 && (
          <div className="text-center text-gray-500 py-8 text-sm" data-testid="empty-cart">Click products to add to cart</div>
        )}
        {cart.map((item) => (
          <div key={item.product.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0" data-testid="cart-item">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">{item.product.name}</div>
              <div className="text-xs text-gray-500">${Number(item.product.sellingPrice).toFixed(2)} each</div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => updateQty(item.product.id, -1)}
                data-testid="qty-decrease"
                className="w-11 h-11 p-0 min-w-0 justify-center text-base"
              >
                -
              </Button>
              <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => updateQty(item.product.id, 1)}
                data-testid="qty-increase"
                className="w-11 h-11 p-0 min-w-0 justify-center text-base"
              >
                +
              </Button>
            </div>
            <div className="w-16 text-right text-sm font-semibold text-gray-900">${(item.product.sellingPrice * item.quantity).toFixed(2)}</div>
          </div>
        ))}
      </div>
      <div className="px-5 py-4 border-t border-gray-200 space-y-2 bg-gray-50">
        <div className="flex justify-between text-sm text-gray-600" data-testid="cart-subtotal"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
        <div className="flex justify-between text-sm text-gray-600" data-testid="cart-tax"><span>Tax (10%)</span><span>${tax.toFixed(2)}</span></div>
        <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-gray-300" data-testid="cart-total"><span>Total</span><span>${total.toFixed(2)}</span></div>

        {/* Payment method selector */}
        <div className="flex gap-1 pt-2">
          {(['cash', 'card', 'split'] as const).map((m) => (
            <Button
              key={m}
              variant={payMethod === m ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setPayMethod(m)}
              className="flex-1 min-h-[44px]"
            >
              {m === 'split' ? 'Split' : m.charAt(0).toUpperCase() + m.slice(1)}
            </Button>
          ))}
        </div>

        {payMethod === 'split' && (
          <div className="space-y-1 pt-1">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 w-12">Cash</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={splitCash}
                onChange={(e) => setSplitCash(e.target.value)}
                placeholder="0.00"
                className="flex-1 min-h-[48px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 w-12">Card</label>
              <span className="flex-1 px-2 py-1 bg-gray-100 rounded text-sm text-gray-700">${splitCardAmt >= 0 ? splitCardAmt.toFixed(2) : '0.00'}</span>
            </div>
            {splitCardAmt < 0 && <div className="text-xs text-red-500">Cash exceeds total</div>}
          </div>
        )}

        <Button
          variant="success"
          size="lg"
          fullWidth
          loading={paying}
          disabled={cart.length === 0 || (payMethod === 'split' && splitCardAmt < 0)}
          className="mt-3"
          onClick={handleCheckout}
          data-testid="pay-btn"
        >
          {paying ? 'Processing...' : `Pay $${total.toFixed(2)}`}
        </Button>
      </div>
    </div>
  );
}
