/**
 * StorefrontConfirmation — order confirmation page.
 *
 * client:visible island. Fetches orders via a session and displays the order
 * matching orderNumber, plus a WhatsApp link when the order is pending.
 */
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStorefrontOrders } from '@/lib/api';
import { getSessionId } from '@/lib/storefrontSession';
import { formatCurrency } from '@/lib/utils';

type Order = { id: string; orderNumber: string; totalAmount: number; status: string; createdAt?: string };

interface Props {
  orderNumber: string;
  tenantId: string;
  primaryColor: string;
  tenantName: string;
}

export default function StorefrontConfirmation({ orderNumber, tenantId, primaryColor, tenantName }: Props) {
  const sessionId = getSessionId(tenantId);
  const [order, setOrder] = useState<Order | null>(null);
  const [notFound, setNotFound] = useState(false);

  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ['storefront-orders', sessionId],
    queryFn: () => getStorefrontOrders(sessionId) as Promise<Order[]>,
    enabled: !!sessionId,
    // never refetch — the order is created before this page loads
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!orders) return;
    const match = orders.find((o) => o.orderNumber === orderNumber || o.id === orderNumber);
    if (match) setOrder(match);
    else setNotFound(true);
  }, [orders, orderNumber]);

  const isPending = !order || order.status === 'pending';
  const showWhatsapp = isPending && !!sessionId; // keep it simple: pending orders can be followed up

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-xl bg-stone-200" />;
  }

  if (notFound) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <h2 className="text-xl font-bold text-stone-800">Order not found</h2>
        <p className="mt-2 text-stone-500">We could not find this order on this device.</p>
        <a href="/storefront" className="mt-4 inline-block rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: primaryColor }}>
          Continue shopping
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-8 shadow-sm">
      {isPending ? (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-2xl">⏳</div>
          <h2 className="text-xl font-bold text-stone-800">Thank you! Your order is being processed.</h2>
          <p className="mt-2 text-stone-500">
            {tenantName} will confirm order <span className="font-semibold text-stone-700">#{order?.orderNumber}</span> shortly.
          </p>
        </div>
      ) : (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl">✅</div>
          <h2 className="text-xl font-bold text-stone-800">Order confirmed!</h2>
          <p className="mt-2 text-stone-500">
            Order <span className="font-semibold text-stone-700">#{order?.orderNumber}</span> · {formatCurrency(order?.totalAmount ?? 0)}
          </p>
        </div>
      )}

      {showWhatsapp && (
        <p className="mt-6 text-center text-sm text-stone-400">
          Questions? Contact <span className="font-medium text-stone-600">{tenantName}</span> directly to speed things up.
        </p>
      )}

      <div className="mt-6 text-center">
        <a href="/storefront" className="inline-block rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90" style={{ backgroundColor: primaryColor }}>
          Continue shopping
        </a>
      </div>
    </div>
  );
}