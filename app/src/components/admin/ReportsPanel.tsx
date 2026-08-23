import React, { useState, useCallback, useEffect } from 'react';
import * as api from '@/lib/api';
import type { Camp } from '@/hooks/useAdminData';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { formatCurrency, formatDate } from '@/lib/utils';

interface ReportsPanelProps {
  campIds: string[];
  camps: Camp[];
}

interface OccupancyReport {
  date: string;
  totalRooms: number;
  occupiedRooms: number;
  occupancyRate: number;
}

interface RevenueReport {
  period: string;
  totalRevenue: number;
  bookingCount: number;
  averagePerBooking: number;
}

interface BookingReport {
  status: string;
  count: number;
  totalAmount: number;
}

const reportTypeOptions = [
  { value: 'occupancy', label: 'Occupancy' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'bookings', label: 'Bookings' },
];

export default function ReportsPanel({ campIds, camps }: ReportsPanelProps) {
  const [reportType, setReportType] = useState<'occupancy' | 'revenue' | 'bookings'>('occupancy');
  const [occupancy, setOccupancy] = useState<OccupancyReport[]>([]);
  const [revenue, setRevenue] = useState<RevenueReport[]>([]);
  const [bookings, setBookings] = useState<BookingReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const { showToast } = useToast();

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      if (reportType === 'occupancy') {
        const data = await api.getOccupancyReport();
        // API returns { totalRooms, occupiedRooms, occupancyRate }
        if (data && typeof data === 'object' && 'totalRooms' in data) {
          setOccupancy([{
            date: 'Current',
            totalRooms: data.totalRooms,
            occupiedRooms: data.occupiedRooms,
            occupancyRate: Math.round((data.occupancyRate || 0) * 10) / 10,
          }]);
        } else {
          setOccupancy(Array.isArray(data) ? data : []);
        }
      } else if (reportType === 'revenue') {
        const params: { days?: number; start?: string; end?: string } = {};
        if (dateRange.start && dateRange.end) {
          params.start = dateRange.start;
          params.end = dateRange.end;
        }
        const data = await api.getRevenueReport(params);
        // API returns { start, end, summary, details }
        if (data && typeof data === 'object' && 'details' in data) {
          const details = Array.isArray(data.details) ? data.details : [];
          setRevenue(details.map((row: { date: string; total: number; count: number }) => ({
            period: row.date,
            totalRevenue: row.total || 0,
            bookingCount: row.count || 0,
            averagePerBooking: row.count > 0 ? Math.round((row.total || 0) / row.count) : 0,
          })));
        } else {
          setRevenue(Array.isArray(data) ? data : []);
        }
      } else {
        const params: { days?: number; start?: string; end?: string } = {};
        if (dateRange.start && dateRange.end) {
          params.start = dateRange.start;
          params.end = dateRange.end;
        }
        const data = await api.getBookingsReport(params);
        // API returns { start, end, byState, byCamp }
        if (data && typeof data === 'object' && 'byState' in data) {
          const states = Array.isArray(data.byState) ? data.byState : [];
          setBookings(states.map((row: { state: string; count: number }) => ({
            status: row.state,
            count: row.count || 0,
            totalAmount: 0,
          })));
        } else {
          setBookings(Array.isArray(data) ? data : []);
        }
      }
    } catch (err) {
      showToast('Error loading report: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setLoading(false);
    }
  }, [reportType, dateRange, campIds, showToast]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

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
