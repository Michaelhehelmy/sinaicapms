import React, { useState, useEffect } from 'react';
import type { Camp } from '@/hooks/useAdminData';
import { useOccupancyReportQuery, useRevenueReportQuery, useBookingsReportQuery, useProfitReportQuery, useOrdersQuery } from '@/hooks/useQueryHooks';
import { useToast } from '@/components/ui/Toast';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils';

interface ReportsPanelProps {
  campIds: string[];
  camps: Camp[];
}

const reportTypeOptions = [
  { value: 'occupancy', label: 'Occupancy' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'bookings', label: 'Bookings' },
  // 5f: per-project P&L split (additive 4th type; existing three untouched).
  { value: 'profit', label: 'Profit by Project' },
];

// ── T40 profit union (frontend-side; backend GET /reports/profit stays
// booking-only, so the storefront leg is merged here) ────────────────────
// Booking leg: per-project rows tagged by the HEADER project (server
// /reports/profit by_project rows, which GROUP BY the order's project).
// Storefront leg: LINE-tagged contributions (storefront_order_items
// project_id + total_price). Total = both-source SUM; per-project rows
// merge both legs. NULL-project lines land in the explicit 'Unassigned'
// bucket (5f idiom) so nothing is silently dropped.
export interface ProfitBookingRow {
  projectId: string | null;
  projectName?: string | null;
  projectType?: string | null;
  revenue: number;
  lineCount?: number;
  orderCount?: number;
}
export interface ProfitStorefrontLine {
  projectId: string | null;
  totalPrice: number;
  orderId?: string | null;
}
export interface ProfitProject {
  id: string;
  name: string;
  projectType?: string | null;
}
export interface MergedProfitRow {
  projectId: string | null;
  projectName: string;
  projectType: string;
  revenue: number;
  lineCount: number;
  orderCount: number;
}
export interface MergedProfitTotal {
  revenue: number;
  lines: number;
  orders: number;
}

export function mergeProfitSources(
  booking: ProfitBookingRow[],
  storefrontLines: ProfitStorefrontLine[],
  projects: ProfitProject[],
): { rows: MergedProfitRow[]; total: MergedProfitTotal } {
  const catalog = new Map(projects.map((p) => [p.id, p]));
  const buckets = new Map<string, MergedProfitRow & { shopOrderIds: Set<string>; shopOrphans: number }>();
  const keyOf = (projectId: string | null | undefined) => projectId ?? 'unassigned';
  const bucket = (
    projectId: string | null | undefined,
    fallbackName?: string | null,
    fallbackType?: string | null,
  ) => {
    const key = keyOf(projectId);
    let b = buckets.get(key);
    if (!b) {
      const cat = projectId ? catalog.get(projectId) : undefined;
      b = {
        projectId: projectId ?? null,
        projectName: fallbackName || cat?.name || 'Unassigned',
        projectType: fallbackType || cat?.projectType || 'unassigned',
        revenue: 0,
        lineCount: 0,
        orderCount: 0,
        shopOrderIds: new Set<string>(),
        shopOrphans: 0,
      };
      buckets.set(key, b);
    }
    return b;
  };
  for (const r of booking) {
    const b = bucket(r.projectId, r.projectName, r.projectType);
    b.revenue += r.revenue ?? 0;
    b.lineCount += r.lineCount ?? 0;
    b.orderCount += r.orderCount ?? 0;
  }
  for (const l of storefrontLines) {
    const b = bucket(l.projectId);
    b.revenue += l.totalPrice ?? 0;
    b.lineCount += 1;
    if (l.orderId != null) b.shopOrderIds.add(l.orderId);
    else b.shopOrphans += 1;
  }
  const rows: MergedProfitRow[] = [...buckets.values()].map((b) => ({
    projectId: b.projectId,
    projectName: b.projectName,
    projectType: b.projectType,
    revenue: b.revenue,
    lineCount: b.lineCount,
    orderCount: b.orderCount + b.shopOrderIds.size + b.shopOrphans,
  }));
  // Server convention: ORDER BY revenue DESC (name ASC tie-break for stability).
  rows.sort((a, b) => b.revenue - a.revenue || a.projectName.localeCompare(b.projectName));
  // Footer-SUM == aggregate by construction (summed over the merged rows).
  const total: MergedProfitTotal = {
    revenue: rows.reduce((a, r) => a + r.revenue, 0),
    lines: rows.reduce((a, r) => a + r.lineCount, 0),
    orders: rows.reduce((a, r) => a + r.orderCount, 0),
  };
  return { rows, total };
}

export default function ReportsPanel({ campIds, camps }: ReportsPanelProps) {
  const { showToast } = useToast();
  const [reportType, setReportType] = useState<'occupancy' | 'revenue' | 'bookings' | 'profit'>('occupancy');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // Only fetch the active report type
  const dateParams = dateRange.start && dateRange.end
    ? { start: dateRange.start, end: dateRange.end }
    : undefined;

  const { data: occData, isLoading: occLoading, error: occError } = useOccupancyReportQuery();
  const { data: revData, isLoading: revLoading, error: revError } = useRevenueReportQuery(dateParams);
  const { data: bookData, isLoading: bookLoading, error: bookError } = useBookingsReportQuery(dateParams);
  // 5f: profit hook (same date-window contract; unconditional like the other three).
  const { data: profitData, isLoading: profitLoading, error: profitError } = useProfitReportQuery(dateParams);
  // T40: storefront leg of the profit union — same date window over the
  // UNION orders list (GET /orders supports ?start=/?end= since bdb500c).
  // Only source='storefront' rows feed the union below; booking rows are
  // ignored here (the booking leg stays server-side — no double count).
  // Unconditional like the other report hooks (stable hook order, TanStack-cached).
  const { data: unionRes, isLoading: unionLoading } = useOrdersQuery(
    dateParams ? { start: dateParams.start, end: dateParams.end } : undefined,
  );

  const loading = reportType === 'occupancy' ? occLoading : reportType === 'revenue' ? revLoading : reportType === 'profit' ? (profitLoading || unionLoading) : bookLoading;

  useEffect(() => {
    if (reportType === 'occupancy' && occError) {
      showToast(`Error loading report: ${occError.message}`, 'error');
    } else if (reportType === 'revenue' && revError) {
      showToast(`Error loading report: ${revError.message}`, 'error');
    } else if (reportType === 'profit' && profitError) {
      showToast(`Error loading report: ${(profitError as Error).message}`, 'error');
    } else if (reportType === 'bookings' && bookError) {
      showToast(`Error loading report: ${bookError.message}`, 'error');
    }
  }, [reportType, occError, revError, profitError, bookError, showToast]);

  // Transform API data into panel-local display shapes
  const occupancy = React.useMemo(() => {
    if (!occData) return [];
    if (occData && typeof occData === 'object' && 'totalRooms' in occData) {
      return [{
        date: 'Current',
        totalRooms: (occData as { totalRooms: number }).totalRooms,
        occupiedRooms: (occData as { occupiedRooms: number }).occupiedRooms,
        occupancyRate: Math.round(((occData as { occupancyRate?: number }).occupancyRate || 0) * 10) / 10,
      }];
    }
    return Array.isArray(occData) ? occData : [];
  }, [occData]);

  const revenue = React.useMemo(() => {
    if (!revData) return [];
    if (revData && typeof revData === 'object' && 'details' in revData) {
      const details = Array.isArray((revData as { details?: unknown[] }).details) ? (revData as { details: Array<{ date: string; total: number; count: number }> }).details : [];
      return details.map((row) => ({
        period: row.date,
        totalRevenue: row.total || 0,
        bookingCount: row.count || 0,
        averagePerBooking: row.count > 0 ? Math.round((row.total || 0) / row.count) : 0,
      }));
    }
    return Array.isArray(revData) ? revData : [];
  }, [revData]);

  const bookings = React.useMemo(() => {
    if (!bookData) return [];
    if (bookData && typeof bookData === 'object' && 'byState' in bookData) {
      const states = Array.isArray((bookData as { byState?: unknown[] }).byState) ? (bookData as { byState: Array<{ state: string; count: number }> }).byState : [];
      return states.map((row) => ({
        status: row.state,
        count: row.count || 0,
      }));
    }
    return Array.isArray(bookData) ? bookData : [];
  }, [bookData]);

  // T40: booking leg of the profit union (server-grouped line grain).
  // Accepts camelCase wire (byProject) and snake_case (by_project).
  const bookingLeg = React.useMemo((): ProfitBookingRow[] => {
    if (!profitData) return [];
    const raw = profitData as unknown as {
      byProject?: Array<{ projectId?: string | null; projectName?: string; projectType?: string; revenue?: number; lineCount?: number; orderCount?: number }>;
      by_project?: Array<{ project_id?: string | null; project_name?: string; project_type?: string; revenue?: number; line_count?: number; order_count?: number }>;
    };
    if (Array.isArray(raw)) {
      return (raw as Array<{ projectId?: string | null; project_id?: string | null; projectName?: string; project_name?: string; projectType?: string; project_type?: string; revenue?: number; lineCount?: number; line_count?: number; orderCount?: number; order_count?: number }>).map((row) => ({
        projectId: (row.projectId ?? row.project_id ?? null) as string | null,
        projectName: (row.projectName ?? row.project_name ?? 'Unassigned') as string,
        projectType: (row.projectType ?? row.project_type ?? 'unassigned') as string,
        revenue: (row.revenue ?? 0) as number,
        lineCount: (row.lineCount ?? row.line_count ?? 0) as number,
        orderCount: (row.orderCount ?? row.order_count ?? 0) as number,
      }));
    }
    const list = Array.isArray(raw.byProject) ? raw.byProject : Array.isArray(raw.by_project) ? raw.by_project.map((r) => ({
      projectId: r.project_id ?? null,
      projectName: r.project_name ?? 'Unassigned',
      projectType: r.project_type ?? 'unassigned',
      revenue: r.revenue ?? 0,
      lineCount: r.line_count ?? 0,
      orderCount: r.order_count ?? 0,
    })) : [];
    return list.map((row) => ({
      projectId: (row.projectId ?? null) as string | null,
      projectName: (row.projectName ?? 'Unassigned') as string,
      projectType: (row.projectType ?? 'unassigned') as string,
      revenue: (row.revenue ?? 0) as number,
      lineCount: (row.lineCount ?? 0) as number,
      orderCount: (row.orderCount ?? 0) as number,
    }));
  }, [profitData]);

  // T40: storefront leg — line-tagged contributions from the union list.
  // Prefers embedded line tags (`items[].projectId/totalPrice`,
  // forward-compatible with a backend line projection); else one
  // header-grain line per order (header project tag, else Unassigned).
  // Cancelled rows are excluded, mirroring the server predicate.
  const storefrontLeg = React.useMemo((): ProfitStorefrontLine[] => {
    const rows = unionRes?.data ?? [];
    const lines: ProfitStorefrontLine[] = [];
    for (const r of rows) {
      if (r.source !== 'storefront') continue;
      if (r.orderStateId === 'cancelled') continue;
      const items = (r as unknown as { items?: Array<{ projectId?: string | null; totalPrice?: number }> }).items;
      if (Array.isArray(items) && items.length > 0) {
        for (const it of items) {
          lines.push({ projectId: it.projectId ?? null, totalPrice: Number(it.totalPrice ?? 0), orderId: r.id });
        }
      } else {
        lines.push({ projectId: r.projectId ?? null, totalPrice: Number(r.totalAmount ?? 0), orderId: r.id });
      }
    }
    return lines;
  }, [unionRes]);

  // T40: per-project P&L rows + both-source total (footer SUM == aggregate
  // by construction — mergeProfitSources sums the merged rows).
  const profit = React.useMemo(() => {
    if (!profitData && storefrontLeg.length === 0) {
      return { rows: [] as MergedProfitRow[], total: null as null | MergedProfitTotal };
    }
    const merged = mergeProfitSources(bookingLeg, storefrontLeg, camps);
    return { rows: merged.rows, total: merged.total };
  }, [profitData, bookingLeg, storefrontLeg, camps]);

  const occupancyRateColor = (rate: number) => {
    if (rate > 80) return 'text-green-600';
    if (rate > 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div data-testid="reports-panel">
      <h2 className="text-xl font-bold text-gray-800 mb-1">Reports</h2>
      <p className="text-sm text-gray-500 mb-4">Track revenue, profit, expenses, and occupancy trends across your camps.</p>

      <div data-testid="report-tabs" className="flex flex-wrap items-center gap-4 mb-6">
        <Select
          options={reportTypeOptions}
          value={reportType}
          onChange={(e) => setReportType(e.target.value as 'occupancy' | 'revenue' | 'bookings' | 'profit')}
        />
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
          />
          <span className="text-gray-500">to</span>
          <Input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
          />
        </div>
      </div>

      <div data-testid="report-content">
      {loading ? (
        <LoadingSpinner text="Generating report..." />
      ) : reportType === 'occupancy' ? (
        <Card data-testid="admin-report-content" padding="none" className="p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Occupancy Report</h3>
          {occupancy.length === 0 ? (
            <p className="text-sm text-gray-500">No occupancy data available.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Date</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Total</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Occupied</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {occupancy.map((row) => (
                    <tr key={row.date} className="border-b border-gray-50">
                      <td className="py-2 px-2 font-medium text-gray-800">{row.date}</td>
                      <td className="py-2 px-2 text-gray-600">{row.totalRooms}</td>
                      <td className="py-2 px-2 text-gray-600">{row.occupiedRooms}</td>
                      <td className="py-2 px-2">
                        <span className={`font-medium ${occupancyRateColor(row.occupancyRate)}`}>
                          {row.occupancyRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : reportType === 'revenue' ? (
        <Card data-testid="admin-report-content" padding="none" className="p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Revenue Report</h3>
          {revenue.length === 0 ? (
            <p className="text-sm text-gray-500">No revenue data available.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Period</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Revenue</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Bookings</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Avg/Booking</th>
                  </tr>
                </thead>
                <tbody>
                  {revenue.map((row) => (
                    <tr key={row.period} className="border-b border-gray-50">
                      <td className="py-2 px-2 font-medium text-gray-800">{row.period}</td>
                      <td className="py-2 px-2 text-green-600 font-medium">{formatCurrency(row.totalRevenue)}</td>
                      <td className="py-2 px-2 text-gray-600">{row.bookingCount}</td>
                      <td className="py-2 px-2 text-gray-600">{formatCurrency(row.averagePerBooking)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : reportType === 'profit' ? (
        <Card data-testid="admin-report-content" padding="none" className="p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Profit by Project</h3>
          {profit.rows.length === 0 ? (
            <p className="text-sm text-gray-500">No profit data available.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Project</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Revenue</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Lines</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {profit.rows.map((row) => (
                    <tr key={row.projectId ?? row.projectName} className="border-b border-gray-50">
                      <td className="py-2 px-2 font-medium text-gray-800">{row.projectName}</td>
                      <td className="py-2 px-2 text-green-600 font-medium">{formatCurrency(row.revenue)}</td>
                      <td className="py-2 px-2 text-gray-600">{row.lineCount}</td>
                      <td className="py-2 px-2 text-gray-600">{row.orderCount}</td>
                    </tr>
                  ))}
                </tbody>
                {profit.total && (
                  <tfoot>
                    <tr data-testid="profit-total" className="bg-gray-50 font-semibold">
                      <td className="py-2 px-2 text-gray-800">Total</td>
                      <td className="py-2 px-2 text-green-700">{formatCurrency(profit.total.revenue)}</td>
                      <td className="py-2 px-2 text-gray-700">{profit.total.lines}</td>
                      <td className="py-2 px-2 text-gray-700">{profit.total.orders}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card data-testid="admin-report-content" padding="none" className="p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Bookings by Status</h3>
          {bookings.length === 0 ? (
            <p className="text-sm text-gray-500">No booking data available.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((row) => (
                    <tr key={row.status} className="border-b border-gray-50">
                      <td className="py-2 px-2 font-medium text-gray-800 capitalize">{row.status?.replace(/_/g, ' ')}</td>
                      <td className="py-2 px-2 text-gray-600">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      </div>
    </div>
  );
}
