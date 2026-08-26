import { usePosOrders } from '@/hooks/usePosQueries';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Card } from '@/components/ui/Card';
import { TableSkeleton } from '@/components/ui/Skeleton';
import type { Order } from '../types';

const statusLabels: Record<string, string> = {
  completed: 'Completed',
  pending: 'Pending',
  confirmed: 'Confirmed',
  voided: 'Voided',
  cancelled: 'Cancelled',
};

// ─── Orders View ───────────────────────────────────────────
export default function OrdersView() {
  const { data: rawOrders, isLoading, error, refetch } = usePosOrders();
  const orders = (Array.isArray(rawOrders) ? rawOrders : []) as Order[];

  if (isLoading) return <div className="p-6"><TableSkeleton rows={5} columns={5} /></div>;
  if (error) return (
    <div className="p-8 text-center">
      <div className="text-red-500 mb-3">{error.message || 'Failed to load orders'}</div>
      <button onClick={() => refetch()} className="text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-md px-4 py-2 border-none cursor-pointer">Try Again</button>
    </div>
  );

  return (
    <div className="p-6 space-y-4" data-testid="pos-orders">
      <h2 className="text-xl font-bold text-gray-900">Orders</h2>
      <Card>
        <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="orders-table">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200 bg-gray-50">
              <th className="px-5 py-3 font-medium">Order #</th>
              <th className="px-5 py-3 font-medium">Total</th>
              <th className="px-5 py-3 font-medium">Payment</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    title="No orders found"
                    description="Orders will appear here once transactions are completed."
                  />
                </td>
              </tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{o.orderNumber}</td>
                <td className="px-5 py-3">${Number(o.totalAmount).toFixed(2)}</td>
                <td className="px-5 py-3 capitalize">{o.paymentMethod || '—'}</td>
                <td className="px-5 py-3">
                  <Badge
                    variant={
                      o.status === 'completed' ? 'success' :
                      o.status === 'voided' ? 'error' : 'neutral'
                    }
                    size="sm"
                    data-testid="order-status"
                  >
                    {statusLabels[o.status] || o.status}
                  </Badge>
                </td>
                <td className="px-5 py-3 text-gray-500">
                  {o.createdAt ? new Date(o.createdAt).toLocaleString() : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
