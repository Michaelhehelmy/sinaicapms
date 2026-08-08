import { useState, useEffect } from 'react';
import * as apiClient from '@/lib/api';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Card, CardHeader } from '@/components/ui/Card';
import { POSDashboardSkeleton } from '@/components/ui/Skeleton';
import type { Dashboard } from '../types';

// ─── Dashboard View ────────────────────────────────────────
export default function DashboardView() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.posGetDashboard()
      .then((data) => setData(data as Dashboard))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <POSDashboardSkeleton />;
  if (error) return <div className="p-8 text-red-500">{error}</div>;
  if (!data) return null;

  return (
    <div className="p-6 space-y-6" data-testid="pos-dashboard">
      <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="Today's Revenue"
          value={`$${Number(data.todayRevenue).toFixed(2)}`}
          color="green"
          data-testid="stat-revenue"
        />
        <StatCard
          title="Today's Orders"
          value={String(data.todayOrders)}
          color="blue"
          data-testid="stat-orders"
        />
        <StatCard
          title="Active Products"
          value={String(data.activeProducts)}
          color="yellow"
          data-testid="stat-low-stock"
        />
      </div>
      <Card data-testid="recent-orders">
        <CardHeader>
          <h3 className="font-semibold text-gray-900">Recent Orders</h3>
        </CardHeader>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="px-5 py-3 font-medium">Order #</th>
              <th className="px-5 py-3 font-medium">Total</th>
              <th className="px-5 py-3 font-medium">Payment</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {data.recentOrders.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    title="No orders yet"
                    description="Orders will appear here once customers start purchasing."
                  />
                </td>
              </tr>
            )}
            {data.recentOrders.map((o) => (
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
                  >
                    {o.status}
                  </Badge>
                </td>
                <td className="px-5 py-3 text-gray-500">
                  {o.createdAt ? new Date(o.createdAt).toLocaleTimeString() : ''}
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
