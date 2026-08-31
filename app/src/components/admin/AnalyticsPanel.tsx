import React, { useState, useMemo } from 'react';
import { useRevenueReportQuery, useOccupancyReportQuery, useTopProductsQuery, useKitchenPerformanceQuery, useAnalyticsLowStockQuery, useRevenueBreakdownQuery, useCustomerMetricsQuery, useSeasonalComparisonQuery } from '@/hooks/useQueryHooks';
import type { components } from '@/lib/api-types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils';

type Schemas = components['schemas'];
type RevenueReport = Schemas['RevenueReport'];
type OccupancyReport = Schemas['OccupancyReport'];

type Tab = 'overview' | 'products' | 'kitchen' | 'inventory' | 'revenue' | 'customers';

const PERIOD_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <Card className="flex flex-col gap-1 p-5">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</span>
      <span className={`text-2xl font-bold ${color || 'text-gray-900'}`}>{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </Card>
  );
}

function HorizontalBarChart({ items, labelKey, valueKey, maxValue, color }: { items: Record<string, unknown>[]; labelKey: string; valueKey: string; maxValue: number; color?: string }) {
  if (!items.length) return <EmptyState title="No data" />;
  const max = maxValue || Math.max(...items.map((i) => Number(i[valueKey]) || 0));
  return (
    <div className="space-y-3">
      {items.map((item, idx) => {
        const val = Number(item[valueKey]) || 0;
        const pct = max > 0 ? (val / max) * 100 : 0;
        return (
          <div key={idx} className="flex items-center gap-3">
            <span className="text-sm text-gray-700 w-32 truncate shrink-0" title={String(item[labelKey])}>{String(item[labelKey])}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
              <div
                className={`h-full rounded-full ${color || 'bg-emerald-500'} transition-all duration-500`}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-gray-800 w-20 text-right shrink-0">{val.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
}

function StackedBarChart({ items, labelKey, stacks }: { items: Record<string, unknown>[]; labelKey: string; stacks: { key: string; color: string; label: string }[] }) {
  if (!items.length) return <EmptyState title="No data" />;
  const maxTotal = Math.max(...items.map((item) => stacks.reduce((sum, s) => sum + (Number(item[s.key]) || 0), 0)));
  return (
    <div className="space-y-2">
      {items.map((item, idx) => {
        const total = stacks.reduce((sum, s) => sum + (Number(item[s.key]) || 0), 0);
        return (
          <div key={idx} className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-20 shrink-0">{String(item[labelKey]).slice(5)}</span>
            <div className="flex-1 flex h-5 rounded-full overflow-hidden bg-gray-100">
              {stacks.map((s, si) => {
                const val = Number(item[s.key]) || 0;
                const pct = maxTotal > 0 ? (val / maxTotal) * 100 : 0;
                return <div key={si} className={`${s.color} transition-all duration-300`} style={{ width: `${pct}%` }} title={`${s.label}: ${val}`} />;
              })}
            </div>
            <span className="text-xs font-medium text-gray-600 w-12 text-right shrink-0">{total}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function AnalyticsPanel() {
  const [tab, setTab] = useState<Tab>('overview');
  const [period, setPeriod] = useState('30');
  const days = parseInt(period);

  const { data: revenue, isLoading: revLoading } = useRevenueReportQuery({ days });
  const { data: occupancy, isLoading: occLoading } = useOccupancyReportQuery();
  const { data: topProductsData, isLoading: tpLoading } = useTopProductsQuery(days, 10);
  const { data: kitchen, isLoading: ksLoading } = useKitchenPerformanceQuery(Math.min(days, 30));
  const { data: lowStockData, isLoading: lsLoading } = useAnalyticsLowStockQuery();
  const { data: revenueBreakdown, isLoading: rbLoading } = useRevenueBreakdownQuery(days);
  const { data: customerMetrics, isLoading: cmLoading } = useCustomerMetricsQuery(days);
  const { data: seasonal, isLoading: scLoading } = useSeasonalComparisonQuery();

  const loading = revLoading || occLoading || tpLoading || ksLoading || lsLoading || rbLoading || cmLoading || scLoading;

  const topProducts = useMemo(() => topProductsData?.top_products ?? [], [topProductsData]);
  const lowStock = useMemo(() => lowStockData?.low_stock ?? [], [lowStockData]);

  const maxRevenue = useMemo(() => {
    if (!revenue?.details?.length) return 0;
    return Math.max(...revenue.details.map((d) => Number(d.total) || 0));
  }, [revenue]);

  const kitchenStacks = useMemo(() => [
    { key: 'completed', color: 'bg-emerald-500', label: 'Completed' },
    { key: 'ready', color: 'bg-amber-400', label: 'Ready' },
    { key: 'pending', color: 'bg-rose-400', label: 'Pending' },
  ], []);

  const kitchenStatusLabel: Record<string, { text: string; variant: 'success' | 'warning' | 'info' | 'danger' | 'neutral' }> = {
    pending: { text: 'Pending', variant: 'warning' },
    in_progress: { text: 'In Progress', variant: 'info' },
    ready: { text: 'Ready', variant: 'success' },
    completed: { text: 'Completed', variant: 'success' },
    canceled: { text: 'Canceled', variant: 'danger' },
  };

  if (loading) return <LoadingSpinner text="Loading analytics..." />;

  return (
    <div className="space-y-6" data-testid="analytics-panel">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Analytics</h2>
          <p className="text-sm text-gray-500">Business insights across reservations, POS, and kitchen operations.</p>
        </div>
        <Select options={PERIOD_OPTIONS} value={period} onChange={(e) => setPeriod(e.target.value)} />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['overview', 'products', 'kitchen', 'inventory', 'revenue', 'customers'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            data-testid={`analytics-tab-${t}`}
          >
            {t === 'overview' ? 'Overview' : t === 'products' ? 'Top Products' : t === 'kitchen' ? 'Kitchen' : t === 'inventory' ? 'Inventory' : t === 'revenue' ? 'Revenue' : 'Customers'}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ──────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Revenue" value={revenue ? formatCurrency(revenue.summary.totalRevenue) : '-'} sub={`${period} day period`} />
            <StatCard label="Collected" value={revenue ? formatCurrency(revenue.summary.totalCollected) : '-'} color="text-emerald-600" />
            <StatCard label="Outstanding" value={revenue ? formatCurrency(revenue.summary.totalOutstanding) : '-'} color={revenue && revenue.summary.totalOutstanding > 0 ? 'text-amber-600' : 'text-gray-900'} />
            <StatCard label="Total Orders" value={revenue?.summary.totalOrders ?? '-'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Occupancy */}
            <Card>
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Occupancy</h3>
              {occupancy ? (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>{occupancy.occupiedRooms} of {occupancy.totalRooms} rooms occupied</span>
                    <span className="font-semibold">{Math.round(occupancy.occupancyRate)}%</span>
                  </div>
                  <div className="bg-gray-100 rounded-full h-4 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(occupancy.occupancyRate, 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <EmptyState title="No occupancy data" />
              )}
            </Card>

            {/* Revenue Trend */}
            <Card>
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Daily Revenue</h3>
              {revenue?.details?.length ? (
                <HorizontalBarChart items={revenue.details} labelKey="date" valueKey="total" maxValue={maxRevenue} color="bg-emerald-500" />
              ) : (
                <EmptyState title="No revenue data" />
              )}
            </Card>
          </div>

          {/* Kitchen summary */}
          <Card>
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Kitchen Status ({period} day summary)</h3>
            {kitchen?.by_status?.length ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {kitchen.by_status.map((s) => {
                  const lbl = kitchenStatusLabel[s.status] || { text: s.status, variant: 'neutral' as const };
                  return (
                    <div key={s.status} className="text-center p-3 bg-gray-50 rounded-lg">
                      <Badge variant={lbl.variant} size="sm" dot>{lbl.text}</Badge>
                      <div className="text-xl font-bold text-gray-900 mt-2">{s.count}</div>
                      <div className="text-xs text-gray-500">orders</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="No kitchen data" />
            )}
          </Card>

          {/* Monthly Revenue Trend (Seasonal) */}
          <Card>
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Monthly Revenue Trend</h3>
            {seasonal?.accommodation_monthly?.length ? (
              <div className="space-y-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Accommodation Revenue</p>
                <HorizontalBarChart
                  items={seasonal.accommodation_monthly.map((m) => ({ label: m.month, revenue: m.revenue }))}
                  labelKey="label"
                  valueKey="revenue"
                  maxValue={Math.max(...seasonal.accommodation_monthly.map((m) => m.revenue))}
                  color="bg-teal-500"
                />
                {seasonal.pos_monthly?.length ? (
                  <>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mt-6 mb-2">POS Revenue</p>
                    <HorizontalBarChart
                      items={seasonal.pos_monthly.map((m) => ({ label: m.month, revenue: m.revenue }))}
                      labelKey="label"
                      valueKey="revenue"
                      maxValue={Math.max(...seasonal.pos_monthly.map((m) => m.revenue))}
                      color="bg-violet-500"
                    />
                  </>
                ) : null}
              </div>
            ) : (
              <EmptyState title="No seasonal data yet" description="Monthly trends will appear as data accumulates." />
            )}
          </Card>
        </div>
      )}

      {/* ── Top Products Tab ──────────────────────────── */}
      {tab === 'products' && (
        <div className="space-y-6">
          <Card>
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Best Sellers (by quantity)</h3>
            {topProducts.length ? (
              <HorizontalBarChart
                items={topProducts.map((p) => ({ name: p.name, total_qty: p.total_qty }))}
                labelKey="name"
                valueKey="total_qty"
                maxValue={Math.max(...topProducts.map((p) => p.total_qty))}
                color="bg-blue-500"
              />
            ) : (
              <EmptyState title="No product data yet" description="POS transactions will populate this chart." />
            )}
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Revenue by Product</h3>
            {topProducts.length ? (
              <HorizontalBarChart
                items={topProducts.map((p) => ({ name: p.name, revenue: p.total_revenue }))}
                labelKey="name"
                valueKey="revenue"
                maxValue={Math.max(...topProducts.map((p) => p.total_revenue))}
                color="bg-violet-500"
              />
            ) : (
              <EmptyState title="No product data yet" />
            )}
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Product Details</h3>
            {topProducts.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100">
                      <th className="pb-2 pr-4 font-medium">Product</th>
                      <th className="pb-2 pr-4 font-medium text-right">Qty Sold</th>
                      <th className="pb-2 pr-4 font-medium text-right">Revenue</th>
                      <th className="pb-2 font-medium text-right">Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p) => (
                      <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2.5 pr-4 font-medium text-gray-900">{p.name}</td>
                        <td className="py-2.5 pr-4 text-right text-gray-700">{p.total_qty}</td>
                        <td className="py-2.5 pr-4 text-right text-gray-700">{formatCurrency(p.total_revenue)}</td>
                        <td className="py-2.5 text-right text-gray-500">{p.order_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No data" />
            )}
          </Card>
        </div>
      )}

      {/* ── Kitchen Tab ───────────────────────────────── */}
      {tab === 'kitchen' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {kitchen?.by_status?.map((s) => {
              const lbl = kitchenStatusLabel[s.status] || { text: s.status, variant: 'neutral' as const };
              return (
                <StatCard key={s.status} label={lbl.text} value={s.count} sub="orders" color={lbl.variant === 'success' ? 'text-emerald-600' : lbl.variant === 'warning' ? 'text-amber-600' : lbl.variant === 'danger' ? 'text-rose-600' : 'text-blue-600'} />
              );
            })}
            {(!kitchen?.by_status || kitchen.by_status.length === 0) && (
              <div className="col-span-4"><EmptyState title="No kitchen orders in this period" /></div>
            )}
          </div>

          <Card>
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Daily Kitchen Trend</h3>
            {kitchen?.daily_trend?.length ? (
              <StackedBarChart items={kitchen.daily_trend} labelKey="date" stacks={kitchenStacks} />
            ) : (
              <EmptyState title="No daily trend data" />
            )}
            {kitchen?.daily_trend?.length ? (
              <div className="flex gap-4 mt-4 pt-3 border-t border-gray-100">
                {kitchenStacks.map((s) => (
                  <div key={s.key} className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 rounded-sm ${s.color}`} />
                    <span className="text-xs text-gray-600">{s.label}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>
        </div>
      )}

      {/* ── Inventory Tab ─────────────────────────────── */}
      {tab === 'inventory' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard label="Low Stock Items" value={lowStock.filter((i) => i.status === 'low').length} color="text-amber-600" />
            <StatCard label="Out of Stock" value={lowStock.filter((i) => i.status === 'out_of_stock').length} color="text-rose-600" />
            <StatCard label="Total Products Low" value={lowStock.length} />
          </div>

          <Card>
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Low Stock Products</h3>
            {lowStock.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100">
                      <th className="pb-2 pr-4 font-medium">Product</th>
                      <th className="pb-2 pr-4 font-medium text-right">Stock</th>
                      <th className="pb-2 pr-4 font-medium text-right">Min Level</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStock.map((p) => (
                      <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2.5 pr-4 font-medium text-gray-900">{p.name}</td>
                        <td className="py-2.5 pr-4 text-right text-gray-700">{p.stock_quantity} {p.unit || ''}</td>
                        <td className="py-2.5 pr-4 text-right text-gray-500">{p.min_stock_level}</td>
                        <td className="py-2.5">
                          <Badge variant={p.status === 'out_of_stock' ? 'error' : 'warning'} dot size="sm">
                            {p.status === 'out_of_stock' ? 'Out of Stock' : 'Low Stock'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="All products are well-stocked" description="No items are at or below their minimum stock level." />
            )}
          </Card>
        </div>
      )}

      {/* ── Revenue Breakdown Tab ─────────────────────── */}
      {tab === 'revenue' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="Accommodation Revenue" value={revenueBreakdown ? formatCurrency(revenueBreakdown.accommodation.revenue) : '-'} sub={`${revenueBreakdown?.accommodation.order_count ?? 0} orders`} color="text-teal-600" />
            <StatCard label="POS Revenue" value={revenueBreakdown ? formatCurrency(revenueBreakdown.by_product_type.reduce((s, t) => s + t.revenue, 0)) : '-'} sub={`${revenueBreakdown?.by_product_type.reduce((s, t) => s + t.order_count, 0) ?? 0} orders`} color="text-violet-600" />
            <StatCard label="Payment Methods" value={revenueBreakdown?.by_payment_method.length ?? '-'} sub="active methods" />
          </div>

          <Card>
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Revenue by Product Type</h3>
            {revenueBreakdown?.by_product_type?.length ? (
              <HorizontalBarChart
                items={revenueBreakdown.by_product_type.map((t) => ({ type: t.type, revenue: t.revenue }))}
                labelKey="type"
                valueKey="revenue"
                maxValue={Math.max(...revenueBreakdown.by_product_type.map((t) => t.revenue))}
                color="bg-emerald-500"
              />
            ) : (
              <EmptyState title="No product type data" />
            )}
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Revenue by Payment Method</h3>
            {revenueBreakdown?.by_payment_method?.length ? (
              <HorizontalBarChart
                items={revenueBreakdown.by_payment_method.map((m) => ({ method: m.method, revenue: m.revenue }))}
                labelKey="method"
                valueKey="revenue"
                maxValue={Math.max(...revenueBreakdown.by_payment_method.map((m) => m.revenue))}
                color="bg-amber-500"
              />
            ) : (
              <EmptyState title="No payment method data" />
            )}
          </Card>
        </div>
      )}

      {/* ── Customer Metrics Tab ──────────────────────── */}
      {tab === 'customers' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Customers" value={customerMetrics?.total_customers ?? '-'} />
            <StatCard label="New Customers" value={customerMetrics?.new_customers ?? '-'} color="text-emerald-600" sub={customerMetrics ? `${Math.round((customerMetrics.new_customers / Math.max(customerMetrics.total_customers, 1)) * 100)}% of total` : undefined} />
            <StatCard label="Repeat Customers" value={customerMetrics?.repeat_customers ?? '-'} color="text-blue-600" sub={customerMetrics ? `${Math.round((customerMetrics.repeat_customers / Math.max(customerMetrics.total_customers, 1)) * 100)}% of total` : undefined} />
            <StatCard label="Avg Order Value" value={customerMetrics ? formatCurrency(customerMetrics.avg_order_value) : '-'} color="text-violet-600" sub={customerMetrics ? `Avg collected: ${formatCurrency(customerMetrics.avg_collected)}` : undefined} />
          </div>

          <Card>
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Customer Composition</h3>
            {customerMetrics ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-700 w-28 shrink-0">New</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${customerMetrics.total_customers > 0 ? (customerMetrics.new_customers / customerMetrics.total_customers) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-gray-800 w-20 text-right shrink-0">
                    {customerMetrics.total_customers > 0 ? Math.round((customerMetrics.new_customers / customerMetrics.total_customers) * 100) : 0}%
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-700 w-28 shrink-0">Repeat</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${customerMetrics.total_customers > 0 ? (customerMetrics.repeat_customers / customerMetrics.total_customers) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-gray-800 w-20 text-right shrink-0">
                    {customerMetrics.total_customers > 0 ? Math.round((customerMetrics.repeat_customers / customerMetrics.total_customers) * 100) : 0}%
                  </span>
                </div>
                <div className="pt-3 border-t border-gray-100 flex gap-6 text-xs text-gray-500">
                  <span>Total: {customerMetrics.total_customers}</span>
                  <span>New: {customerMetrics.new_customers}</span>
                  <span>Repeat: {customerMetrics.repeat_customers}</span>
                </div>
              </div>
            ) : (
              <EmptyState title="No customer data yet" />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
