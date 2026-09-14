/**
 * StorefrontCheckout — customer form → checkout → Paymob iframe or WhatsApp fallback.
 *
 * client:load island. Reads cart from session, POSTs to checkout endpoint.
 * If Paymob is enabled, opens the Paymob Accept iframe inline for payment.
 * Otherwise, shows a WhatsApp fallback button (wa.me link) for manual payment.
 */
import { useState, useCallback, useEffect, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStorefrontCart, checkoutStorefront } from '@/lib/api';
import { getSessionId } from '@/lib/storefrontSession';
import { formatCurrency } from '@/lib/utils';

type CartItem = { id: string; productName?: string; quantity: number; totalPrice: number };

interface Props {
  tenantId: string;
  primaryColor: string;
}

export default function StorefrontCheckout({ tenantId, primaryColor }: Props) {
  const sessionId = getSessionId(tenantId);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [checkoutResult, setCheckoutResult] = useState<{
    orderId: string;
    orderNumber: string;
    totalAmount: number;
    paymobEnabled?: boolean;
    paymobIntention?: { clientSecret: string; id: number } | null;
    publicKey?: string | null;
    paymentMethods?: number[] | null;
    fallbackWhatsapp?: boolean;
  } | null>(null);
  const [paymobToken, setPaymobToken] = useState<string | null>(null);

  const { data: cart } = useQuery<{ id: string; items: CartItem[] }>({
    queryKey: ['storefront-cart', sessionId],
    queryFn: () => getStorefrontCart(sessionId) as Promise<{ id: string; items: CartItem[] }>,
    enabled: !!sessionId,
  });

  const items = cart?.items ?? [];
  const total = items.reduce((n: number, i: CartItem) => n + i.totalPrice, 0);

  // If Paymob enabled, obtain an auth token to render the iframe
  useEffect(() => {
    if (!checkoutResult?.paymobEnabled || !checkoutResult.publicKey || !checkoutResult.paymobIntention?.clientSecret) return;

    const getToken = async () => {
      try {
        const res = await fetch('https://accept.paymob.com/api/auth/tokens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: checkoutResult.publicKey }),
        });
        const data = await res.json();
        if (data?.token) setPaymobToken(data.token);
      } catch {
        // If token fetch fails, fall back to WhatsApp
      }
    };
    getToken();
  }, [checkoutResult]);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!sessionId) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await checkoutStorefront({
        sessionId,
        customerEmail: email || undefined,
        customerPhone: phone || undefined,
        shippingAddress: address || undefined,
      });
      setCheckoutResult(res);
      // NOTE: the session is intentionally NOT cleared here — the cart is
      // emptied server-side, and the confirmation page needs the sessionId
      // to look the order up via getStorefrontOrders().
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  }, [sessionId, email, phone, address]);

  // ── Empty cart guard ───────────────────────────────────────────────────
  if (!sessionId || (items.length === 0 && !checkoutResult)) {
    return (
      <div className="text-center py-12">
        <p className="text-stone-500">Your cart is empty.</p>
        <a href="/storefront" className="mt-3 inline-block rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: primaryColor }}>
          Browse products
        </a>
      </div>
    );
  }

  // ── Post-checkout: payment screen ──────────────────────────────────────
  if (checkoutResult) {
    const integrationId = checkoutResult.paymentMethods?.[0];
    const whatsappNumber = phone.replace(/\D/g, '');

    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-stone-800">Order #{checkoutResult.orderNumber}</h2>
          <p className="mt-1 text-sm text-stone-500">Total: {formatCurrency(checkoutResult.totalAmount)}</p>
        </div>

        {/* Paymob iframe */}
        {checkoutResult.paymobEnabled && paymobToken && integrationId && (
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 font-semibold text-stone-800">Pay securely</h3>
            <iframe
              src={`https://accept.paymob.com/api/acceptance/iframes/${integrationId}?payment_token=${paymobToken}`}
              className="h-[500px] w-full rounded-lg border-0"
              title="Payment"
              allow="payment"
            />
          </div>
        )}

        {/* Paymob loading or WhatsApp fallback */}
        {checkoutResult.paymobEnabled && !paymobToken && (
          <div className="rounded-xl border border-stone-200 bg-white p-6 text-center shadow-sm">
            <p className="text-stone-500">Loading payment form...</p>
          </div>
        )}

        {!checkoutResult.paymobEnabled && (
          <div className="rounded-xl border border-stone-200 bg-white p-6 text-center shadow-sm">
            <p className="text-stone-600">Online payment is not available. Please complete your order via WhatsApp.</p>
            {whatsappNumber ? (
              <a
                href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hi! I'd like to pay for order #${checkoutResult.orderNumber} (total: ${formatCurrency(checkoutResult.totalAmount)})`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block rounded-lg bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Pay via WhatsApp
              </a>
            ) : (
              <p className="mt-3 text-sm text-stone-400">No phone number provided — contact the host directly.</p>
            )}
          </div>
        )}

        <a
          href={`/storefront/order/${checkoutResult.orderNumber}/confirmation`}
          className="block text-center text-sm font-medium text-stone-600 underline hover:text-stone-900"
        >
          View order confirmation
        </a>
      </div>
    );
  }

  // ── Checkout form ──────────────────────────────────────────────────────
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-stone-800">Checkout</h1>

      {/* Order summary */}
      <div className="mb-6 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 font-semibold text-stone-700">Order summary</h2>
        <ul className="space-y-1 text-sm text-stone-600">
          {items.map((item: CartItem) => (
            <li key={item.id} className="flex justify-between">
              <span>{item.productName || item.productId} × {item.quantity}</span>
              <span>{formatCurrency(item.totalPrice)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-stone-200 pt-3 font-bold text-stone-800">
          <span>Total</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-stone-700">Email (optional)</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="phone" className="mb-1 block text-sm font-medium text-stone-700">Phone (for WhatsApp payment)</label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+20 1XX XXX XXXX"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="address" className="mb-1 block text-sm font-medium text-stone-700">Shipping address (optional)</label>
          <textarea
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Delivery address"
            rows={3}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg py-3 text-center font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: primaryColor }}
        >
          {submitting ? 'Placing order...' : 'Place order'}
        </button>
      </form>
    </div>
  );
}
