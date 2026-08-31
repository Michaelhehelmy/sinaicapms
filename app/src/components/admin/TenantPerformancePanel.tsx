import React, { useCallback } from 'react';
import { StatCard } from '@/components/ui/StatCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAdminPerformanceQuery } from '@/hooks/useQueryHooks';
import { useToast } from '@/components/ui/Toast';
import { exportAdminPerformance } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

const TREND_COLORS: Record<string, string> = {
  up: 'bg-green-100 text-green-700',
  down: 'bg-red-100 text-red-700',
  flat: 'bg-gray-100 text-gray-600',
};

const TREND_ICONS: Record<string, string> = {
  up: '\u2191',
  down: '\u2193',
  flat: '\u2192',
};

export default function TenantPerformancePanel() {
  const { showToast } = useToast();
  const { data: perf, isLoading } = useAdminPerformanceQuery();

  const tenants = perf?.tenants ?? [];
  const rankings = perf?.rankings ?? { revenue: [], occupancy: [], growth: [] };

  // Aggregate totals
  const totalRevenue = tenants.reduce((sum, t) => sum + t.metrics.revenue, 0);
  const totalBookings = tenants.reduce((sum, t) => sum + t.metrics.bookings, 0);
  const totalRooms = tenants.reduce((sum, t) => sum + (t.metrics.occupancy > 0 ? Math.round((t.metrics.occupancy / 100) * 100) : 0), 0); // placeholder
  const totalEmployees = tenants.reduce((sum, t) => sum + t.metrics.employeeCount, 0);
  const avgOccupancy = tenants.length > 0
    ? Math.round(tenants.reduce((sum, t) => sum + t.metrics.occupancy, 0) / tenants.length)
    : 0;

  const handleExport = useCallback(async () => {
    try {
      const response = await exportAdminPerformance();
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tenant_performance.csv';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Performance data exported', 'success');
    } catch {
      showToast('Failed to export performance data', 'error');
    }
  }, [showToast]);

  if (isLoading) {
    return (
      <div className="py-16">
        <LoadingSpinner text="Loading performance data..." />
      </div>
    );
  }

  return (
    <div data-testid="tenant-performance-panel">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Tenant Performance</h2>
          <p className="text-xs text-gray-500 mt-0.5">Cross-tenant analytics, rankings, and comparisons</p>
        </div>
        <Button size="sm" variant="secondary" onClick={handleExport}>
          Export CSV
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <StatCard title="Total Tenants" value={tenants.length} color="blue" />
        <StatCard title="Total Revenue" value={formatCurrency(totalRevenue)} color="green" />
        <StatCard title="Total Bookings" value={totalBookings.toLocaleString()} color="yellow" />
        <StatCard title="Avg Occupancy" value={`${avgOccupancy}%`} color="purple" />
        <StatCard title="Total Staff" value={totalEmployees} color="red" />
      </div>

      {/* Rankings Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Revenue Ranking */}
        <Card padding="md">
          <h3 className="text-xs font-bold text-gray-700 mb-3">Top by Revenue</h3>
          {rankings.revenue.length === 0 ? (
            <div className="text-xs text-gray-400 py-4 text-center">No data</div>
          ) : (
            <ol className="space-y-2">
              {rankings.revenue.map((r, i) => (
                <li key={r.tenantId} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 font-mono w-4">{i + 1}.</span>
                    <span className="text-gray-800 font-medium">{r.name}</span>
                  </div>
                  <span className="text-green-600 font-semibold">{formatCurrency(r.revenue)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {/* Occupancy Ranking */}
        <Card padding="md">
          <h3 className="text-xs font-bold text-gray-700 mb-3">Top by Occupancy</h3>
          {rankings.occupancy.length === 0 ? (
            <div className="text-xs text-gray-400 py-4 text-center">No data</div>
          ) : (
            <ol className="space-y-2">
              {rankings.occupancy.map((r, i) => (
                <li key={r.tenantId} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 font-mono w-4">{i + 1}.</span>
                    <span className="text-gray-800 font-medium">{r.name}</span>
                  </div>
                  <span className="text-blue-600 font-semibold">{r.occupancy}%</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {/* Growth Ranking */}
        <Card padding="md">
          <h3 className="text-xs font-bold text-gray-700 mb-3">Top by Growth</h3>
          {rankings.growth.length === 0 ? (
            <div className="text-xs text-gray-400 py-4 text-center">No data</div>
          ) : (
            <ol className="space-y-2">
              {rankings.growth.map((r, i) => (
                <li key={r.tenantId} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 font-mono w-4">{i + 1}.</span>
                    <span className="text-gray-800 font-medium">{r.name}</span>
                  </div>
                  <span className="text-purple-600 font-semibold">{r.growthRate}%</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {/* Full Tenant Table */}
      <Card padding="md">
        <h3 className="text-sm font-bold text-gray-700 mb-3">All Tenants</h3>
        {tenants.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-xs">No tenant data available</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 font-semibold text-gray-500">Tenant</th>
                  <th className="text-right py-2 font-semibold text-gray-500">Revenue</th>
                  <th className="text-right py-2 font-semibold text-gray-500">Bookings</th>
                  <th className="text-right py-2 font-semibold text-gray-500">Occupancy</th>
                  <th className="text-right py-2 font-semibold text-gray-500">Staff</th>
                  <th className="text-right py-2 font-semibold text-gray-500">Inventory</th>
                  <th className="text-right py-2 font-semibold text-gray-500">Leads</th>
                  <th className="text-right py-2 font-semibold text-gray-500">Revenue Trend</th>
                  <th className="text-right py-2 font-semibold text-gray-500">Booking Trend</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="py-2 text-gray-800 font-medium">{t.name}</td>
                    <td className="py-2 text-right text-gray-700">{formatCurrency(t.metrics.revenue)}</td>
                    <td className="py-2 text-right text-gray-700">{t.metrics.bookings.toLocaleString()}</td>
                    <td className="py-2 text-right text-gray-700">{t.metrics.occupancy}%</td>
                    <td className="py-2 text-right text-gray-700">{t.metrics.employeeCount}</td>
                    <td className="py-2 text-right text-gray-700">{formatCurrency(t.metrics.inventoryValue)}</td>
                    <td className="py-2 text-right text-gray-700">{t.metrics.leads}</td>
                    <td className="py-2 text-right">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${TREND_COLORS[t.trends.revenue] ?? 'bg-gray-100 text-gray-600'}`}>
                        {TREND_ICONS[t.trends.revenue] ?? '\u2192'} {t.trends.revenue}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${TREND_COLORS[t.trends.bookings] ?? 'bg-gray-100 text-gray-600'}`}>
                        {TREND_ICONS[t.trends.bookings] ?? '\u2192'} {t.trends.bookings}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
