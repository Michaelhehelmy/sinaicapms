import React, { useState, useEffect } from 'react';
import type { Camp } from '@/hooks/useAdminData';
import { useOccupancyReportQuery, useRevenueReportQuery, useBookingsReportQuery } from '@/hooks/useQueryHooks';
import { useToast } from '@/components/ui/Toast';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
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
];

export default function ReportsPanel({ campIds, camps }: ReportsPanelProps) {
  const { showToast } = useToast();
  const [reportType, setReportType] = useState<'occupancy' | 'revenue' | 'bookings'>('occupancy');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // Only fetch the active report type
  const dateParams = dateRange.start && dateRange.end
    ? { start: dateRange.start, end: dateRange.end }
    : undefined;

  const { data: occData, isLoading: occLoading, error: occError } = useOccupancyReportQuery();
  const { data: revData, isLoading: revLoading, error: revError } = useRevenueReportQuery(dateParams);
  const { data: bookData, isLoading: bookLoading, error: bookError } = useBookingsReportQuery(dateParams);

  const loading = reportType === 'occupancy' ? occLoading : reportType === 'revenue' ? revLoading : bookLoading;

  useEffect(() => {
    if (reportType === 'occupancy' && occError) {
      showToast(`Error loading report: ${occError.message}`, 'error');
    } else if (reportType === 'revenue' && revError) {
      showToast(`Error loading report: ${revError.message}`, 'error');
    } else if (reportType === 'bookings' && bookError) {
      showToast(`Error loading report: ${bookError.message}`, 'error');
    }
  }, [reportType, occError, revError, bookError, showToast]);

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
        totalAmount: 0,
      }));
    }
    return Array.isArray(bookData) ? bookData : [];
  }, [bookData]);

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
          onChange={(e) => setReportType(e.target.value as 'occupancy' | 'revenue' | 'bookings')}
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
                  {occupancy.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50">
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
                  {revenue.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50">
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
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-2 px-2 font-medium text-gray-800 capitalize">{row.status?.replace(/_/g, ' ')}</td>
                      <td className="py-2 px-2 text-gray-600">{row.count}</td>
                      <td className="py-2 px-2 text-gray-600">{formatCurrency(row.totalAmount)}</td>
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
