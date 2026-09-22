/**
 * StorefrontCart — cart page with quantity update, remove, totals.
 *
 * client:visible island. Reads session from localStorage, fetches cart via API.
 */
import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getStorefrontCart,
  updateStorefrontCartItem,
  removeStorefrontCartItem,
} from '@/lib/api';
import { getSessionId, broadcastCartUpdate } from '@/lib/storefrontSession';
import { formatCurrency } from '@/lib/utils';

type CartItem = { id: string; productId: string; productName?: string; quantity: number; unitPrice: number; totalPrice: number };

interface Props {
  tenantId: string;
  primaryColor: string;
}

export default function StorefrontCart({ tenantId, primaryColor }: Props) {
  const sessionId = getSessionId(tenantId);
  const queryClient = useQueryClient();

  const { data: cart, isLoading } = useQuery<{ id: string; items: CartItem[] }>({
    queryKey: ['storefront-cart', sessionId],
    queryFn: () => getStorefrontCart(sessionId) as Promise<{ id: string; items: CartItem[] }>,
    enabled: !!sessionId,
    placeholderData: (prev) => prev,
  });

  const items = cart?.items ?? [];
  const totalItems = items.reduce((n: number, i: CartItem) => n + i.quantity, 0);
  const totalPrice = items.reduce((n: number, i: CartItem) => n + i.totalPrice, 0);

  const invalidateCart = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['storefront-cart', sessionId] });
    broadcastCartUpdate();
  }, [queryClient, sessionId]);

  const updateMutation = useMutation({
    mutationFn: (data: { itemId: string; quantity: number }) =>
      updateStorefrontCartItem(data.itemId, data.quantity),
    onSuccess: invalidateCart,
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: string) => removeStorefrontCartItem(itemId),
    onSuccess: invalidateCart,
  });

  if (!sessionId) {
    return (
      <div className="text-center py-12 text-stone-500">
        Your cart is empty. <a href="/storefront" className="underline text-stone-700">Browse products</a>
      </div>
    );
  }

  if (isLoading) {
    return <div className="space-y-3 py-6">{[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-stone-200" />)}</div>;
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-stone-500">Your cart is empty.</p>
        <a href="/storefront" className="mt-3 inline-block rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: primaryColor }}>Browse products</a>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-stone-800">Cart ({totalItems} {totalItems === 1 ? 'item' : 'items'})</h1>

      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-stone-800 truncate">{item.productName || item.productId}</h3>
              <p className="text-sm text-stone-500">{formatCurrency(item.unitPrice)} each</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (item.quantity <= 1) removeMutation.mutate(item.id);
                  else updateMutation.mutate({ itemId: item.id, quantity: item.quantity - 1 });
                }}
                aria-label={`Decrease quantity of ${item.productName || item.productId}`}
                className="h-8 w-8 rounded border border-stone-300 text-stone-600 hover:bg-stone-50"
              >
                <span aria-hidden="true">−</span>
              </button>
              <span className="w-8 text-center text-sm font-medium" role="status" aria-label={`Quantity of ${item.productName || item.productId}: ${item.quantity}`}>{item.quantity}</span>
              <button
                onClick={() => updateMutation.mutate({ itemId: item.id, quantity: item.quantity + 1 })}
                aria-label={`Increase quantity of ${item.productName || item.productId}`}
                className="h-8 w-8 rounded border border-stone-300 text-stone-600 hover:bg-stone-50"
              >
                <span aria-hidden="true">+</span>
              </button>
            </div>

            <span className="w-24 text-right font-semibold text-stone-800">{formatCurrency(item.totalPrice)}</span>

            <button
              onClick={() => removeMutation.mutate(item.id)}
              aria-label={`Remove ${item.productName || item.productId} from cart`}
              className="text-sm text-red-500 hover:text-red-700"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between text-lg font-bold">
          <span>Total</span>
          <span>{formatCurrency(totalPrice)}</span>
        </div>
        <a
          href="/storefront/checkout"
          className="mt-4 block w-full rounded-lg py-3 text-center font-medium text-white transition hover:opacity-90"
          style={{ backgroundColor: primaryColor }}
        >
          Proceed to checkout
        </a>
      </div>
    </div>
  );
}
