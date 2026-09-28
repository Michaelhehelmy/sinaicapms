import React, { useState, useEffect } from 'react';
import type { Camp } from '@/hooks/useAdminData';
import { useOccupancyReportQuery, useRevenueReportQuery, useBookingsReportQuery, useProfitReportQuery } from '@/hooks/useQueryHooks';
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

// ── T40 client-leg removal (server-only profit; backend GET /reports/profit
// UNIONs booking + storefront lines at line grain since 3bcab82) ──────────
// The pre-union client storefrontLeg (useOrdersQuery over GET /orders +
// mergeProfitSources) double-counted storefront once the server union
// deployed (3100 server + 3100 client = 6200, see cb88355). Profit now renders
// the server rows verbatim — no second fetch, no client merge. The explicit
// 'Unassigned' fallback STAYS (server COALESCEs NULL-project lines via LEFT
// JOIN projects; client keeps ?? 'Unassigned' so legacy NULL lines and
// FK-orphans on project delete never silently drop). Do NOT delete it and do
// NOT re-add a client orders fetch for profit.
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
  // T40 client-leg removal: server-only — no useOrdersQuery fetch for profit
  // (backend GET /reports/profit UNIONs both legs; a client leg double-counts).
  const { data: profitData, isLoading: profitLoading, error: profitError } = useProfitReportQuery(dateParams);

  const loading = reportType === 'occupancy' ? occLoading : reportType === 'revenue' ? revLoading : reportType === 'profit' ? profitLoading : bookLoading;

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

  // T40 client-leg removal: server-only profit rows + server total.
  // Backend GET /reports/profit UNIONs booking + storefront lines at line
  // grain (GROUP BY lines.project_id, ORDER BY revenue DESC). Accepts
  // camelCase wire (byProject/totalRevenue) and snake_case (by_project/
  // total_revenue) plus a bare-array passthrough. 'Unassigned' stays as an
  // explicit defensive fallback (server COALESCE + client ??) so legacy NULL
  // lines and FK-orphans never silently drop. No orders fetch, no merge.
  const profit = React.useMemo(() => {
    if (!profitData) {
      return { rows: [] as MergedProfitRow[], total: null as null | MergedProfitTotal };
    }
    const raw = profitData as unknown as {
      byProject?: Array<{ projectId?: string | null; projectName?: string | null; projectType?: string | null; revenue?: number; lineCount?: number; orderCount?: number }>;
      by_project?: Array<{ project_id?: string | null; project_name?: string | null; project_type?: string | null; revenue?: number; line_count?: number; order_count?: number }>;
      total?: { totalRevenue?: number; total_revenue?: number; totalLines?: number; total_lines?: number; totalOrders?: number; total_orders?: number };
    };
    const normRows = (list: Array<Record<string, unknown>>): MergedProfitRow[] =>
      list.map((row) => ({
        projectId: ((row.projectId ?? row.project_id ?? null) as string | null),
        projectName: ((row.projectName ?? row.project_name ?? 'Unassigned') as string) || 'Unassigned',
        projectType: ((row.projectType ?? row.project_type ?? 'unassigned') as string) || 'unassigned',
        revenue: Number(row.revenue ?? 0),
        lineCount: Number(row.lineCount ?? row.line_count ?? 0),
        orderCount: Number(row.orderCount ?? row.order_count ?? 0),
      }));
    let rows: MergedProfitRow[];
    if (Array.isArray(raw)) {
      rows = normRows(raw as unknown as Array<Record<string, unknown>>);
    } else {
      const list = Array.isArray(raw.byProject)
        ? (raw.byProject as unknown as Array<Record<string, unknown>>)
        : Array.isArray(raw.by_project)
          ? (raw.by_project as unknown as Array<Record<string, unknown>>)
          : [];
      rows = normRows(list);
    }
    // Server convention: ORDER BY revenue DESC (name ASC tie-break for stability).
    rows.sort((a, b) => b.revenue - a.revenue || a.projectName.localeCompare(b.projectName));
    // Server-only total: prefer the server aggregate when present, else the
    // footer SUM over the server rows (same rows, never a client second source).
    const t = (Array.isArray(raw) ? undefined : raw.total) as
      | { totalRevenue?: number; total_revenue?: number; totalLines?: number; total_lines?: number; totalOrders?: number; total_orders?: number }
      | undefined;
    const total: MergedProfitTotal | null = rows.length === 0 && !t
      ? null
      : {
          revenue: Number(t?.totalRevenue ?? t?.total_revenue ?? rows.reduce((a, r) => a + r.revenue, 0)),
          lines: Number(t?.totalLines ?? t?.total_lines ?? rows.reduce((a, r) => a + r.lineCount, 0)),
          orders: Number(t?.totalOrders ?? t?.total_orders ?? rows.reduce((a, r) => a + r.orderCount, 0)),
        };
    return { rows, total };
  }, [profitData]);

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
