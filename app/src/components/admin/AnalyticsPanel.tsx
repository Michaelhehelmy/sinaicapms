import React, { useState, useMemo, useCallback, useEffect } from 'react';
import * as api from '@/lib/api';
import type { TopProduct, KitchenStatusCount, KitchenTrend, LowStockItem } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/utils';

type Tab = 'overview' | 'products' | 'kitchen' | 'inventory';

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
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [period, setPeriod] = useState('30');
  const [loading, setLoading] = useState(true);

  const [revenue, setRevenue] = useState<RevenueReport | null>(null);
  const [occupancy, setOccupancy] = useState<OccupancyReport | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [kitchen, setKitchen] = useState<{ by_status: KitchenStatusCount[]; daily_trend: KitchenTrend[] } | null>(null);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);

  const loadData = useCallback(async () => {
    const days = parseInt(period);
    try {
      const [rev, occ, tp, ks, ls] = await Promise.allSettled([
        api.getRevenueReport({ days }),
        api.getOccupancyReport(),
        api.getTopProducts(days, 10),
        api.getKitchenPerformance(Math.min(days, 30)),
        api.getAnalyticsLowStock(),
      ]);
      if (rev.status === 'fulfilled') setRevenue(rev.value as RevenueReport);
      if (occ.status === 'fulfilled') setOccupancy(occ.value as OccupancyReport);
      if (tp.status === 'fulfilled') setTopProducts((tp.value as { top_products: TopProduct[] }).top_products);
      if (ks.status === 'fulfilled') {
        const kv = ks.value as { by_status: KitchenStatus[]; daily_trend: KitchenTrend[] };
        setKitchen(kv);
      }
      if (ls.status === 'fulfilled') setLowStock((ls.value as { low_stock: LowStockItem[] }).low_stock);
    } catch (err) {
      showToast('Failed to load analytics: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [period, showToast]);

  useEffect(() => { loadData().finally(() => setLoading(false)); }, [loadData]);

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
        <Select options={PERIOD_OPTIONS} value={period} onChange={(e) => { setPeriod(e.target.value); setLoading(true); }} />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['overview', 'products', 'kitchen', 'inventory'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            data-testid={`analytics-tab-${t}`}
          >
            {t === 'overview' ? 'Overview' : t === 'products' ? 'Top Products' : t === 'kitchen' ? 'Kitchen' : 'Inventory'}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ──────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Revenue" value={revenue ? formatCurrency(revenue.summary.total_revenue) : '-'} sub={`${period} day period`} />
            <StatCard label="Collected" value={revenue ? formatCurrency(revenue.summary.total_collected) : '-'} color="text-emerald-600" />
            <StatCard label="Outstanding" value={revenue ? formatCurrency(revenue.summary.total_outstanding) : '-'} color={revenue && revenue.summary.total_outstanding > 0 ? 'text-amber-600' : 'text-gray-900'} />
            <StatCard label="Total Orders" value={revenue?.summary.total_orders ?? '-'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Occupancy */}
            <Card>
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Occupancy</h3>
              {occupancy ? (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>{occupancy.occupied_rooms} of {occupancy.total_rooms} rooms occupied</span>
                    <span className="font-semibold">{Math.round(occupancy.occupancy_rate)}%</span>
                  </div>
                  <div className="bg-gray-100 rounded-full h-4 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(occupancy.occupancy_rate, 100)}%` }}
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                          <Badge variant={p.status === 'out_of_stock' ? 'danger' : 'warning'} dot size="sm">
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
    </div>
  );
}
