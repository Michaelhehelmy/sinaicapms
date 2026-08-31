import React, { useState, useCallback, useMemo } from 'react';
import { StatCard } from '@/components/ui/StatCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAdminReportsQuery, useAdminScheduledReportsQuery } from '@/hooks/useQueryHooks';
import { useToast } from '@/components/ui/Toast';
import { generateAdminReport, createAdminScheduledReport, deleteAdminScheduledReport } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

export default function SuperReportsPanel() {
  const { showToast } = useToast();
  const { data: reportData, isLoading: loadingTemplates } = useAdminReportsQuery();
  const { data: scheduledData, isLoading: loadingScheduled, refetch: refetchScheduled } = useAdminScheduledReportsQuery();
  const [generating, setGenerating] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState({ schedule: 'daily', recipients: '' });

  const templates = reportData?.reports ?? [];
  const scheduled = scheduledData?.scheduled ?? [];

  const categories = useMemo(() => {
    const cats = new Map<string, typeof templates>();
    templates.forEach((t) => {
      const list = cats.get(t.category) ?? [];
      list.push(t);
      cats.set(t.category, list);
    });
    return cats;
  }, [templates]);

  const handleGenerate = useCallback(async (reportId: string) => {
    setGenerating(reportId);
    try {
      const result = await generateAdminReport({ reportId });
      if (result.downloadUrl) {
        window.open(result.downloadUrl, '_blank');
      }
      showToast('Report generated successfully', 'success');
    } catch {
      showToast('Failed to generate report', 'error');
    } finally {
      setGenerating(null);
    }
  }, [showToast]);

  const handleSchedule = useCallback(async (reportId: string) => {
    setScheduling(true);
    try {
      const recipients = scheduleForm.recipients
        ? scheduleForm.recipients.split(',').map((r) => r.trim()).filter(Boolean)
        : [];
      await createAdminScheduledReport({ reportId, schedule: scheduleForm.schedule, recipients });
      showToast('Report scheduled', 'success');
      setSelectedReport(null);
      refetchScheduled();
    } catch {
      showToast('Failed to schedule report', 'error');
    } finally {
      setScheduling(false);
    }
  }, [scheduleForm, showToast, refetchScheduled]);

  const handleDeleteSchedule = useCallback(async (id: string) => {
    try {
      await deleteAdminScheduledReport(id);
      showToast('Schedule removed', 'info');
      refetchScheduled();
    } catch {
      showToast('Failed to remove schedule', 'error');
    }
  }, [showToast, refetchScheduled]);

  if (loadingTemplates || loadingScheduled) {
    return (
      <div className="py-16">
        <LoadingSpinner text="Loading reports..." />
      </div>
    );
  }

  return (
    <div data-testid="super-reports-panel">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-800">Reports</h2>
        <p className="text-xs text-gray-500 mt-0.5">Generate and schedule platform-wide analytics reports</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Report Templates" value={templates.length} color="blue" />
        <StatCard title="Scheduled Reports" value={scheduled.length} color="green" />
        <StatCard title="Categories" value={categories.size} color="purple" />
        <StatCard title="Export Formats" value="CSV, JSON" color="yellow" />
      </div>

      {/* Report Templates by Category */}
      <div className="space-y-6 mb-8">
        {Array.from(categories.entries()).map(([category, reports]) => (
          <div key={category}>
            <h3 className="text-sm font-bold text-gray-700 capitalize mb-3">{category} Reports</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reports.map((report) => (
                <Card key={report.id} padding="md" className="hover:shadow-md transition-shadow">
                  <div className="flex flex-col h-full">
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-gray-800 mb-1">{report.name}</h4>
                      <p className="text-xs text-gray-500 mb-3">{report.description}</p>
                      <div className="flex flex-wrap gap-1 mb-3">
                        {report.formats.map((f) => (
                          <span key={f} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600">
                            {f.toUpperCase()}
                          </span>
                        ))}
                      </div>
                      {report.parameters.length > 0 && (
                        <div className="text-[10px] text-gray-400 mb-3">
                          Parameters: {report.parameters.map((p) => p.name).join(', ')}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleGenerate(report.id)}
                        disabled={generating === report.id}
                      >
                        {generating === report.id ? 'Generating...' : 'Generate'}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setSelectedReport(selectedReport === report.id ? null : report.id)}
                      >
                        Schedule
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Schedule Form (inline) */}
      {selectedReport && (
        <Card padding="md" className="mb-6 border border-blue-200 bg-blue-50/50">
          <h3 className="text-sm font-bold text-gray-800 mb-3">Schedule Report</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Frequency</label>
              <select
                value={scheduleForm.schedule}
                onChange={(e) => setScheduleForm((prev) => ({ ...prev, schedule: e.target.value }))}
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Recipients (comma-separated email)</label>
              <input
                type="text"
                value={scheduleForm.recipients}
                onChange={(e) => setScheduleForm((prev) => ({ ...prev, recipients: e.target.value }))}
                placeholder="admin@example.com"
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={() => handleSchedule(selectedReport)} disabled={scheduling}>
              {scheduling ? 'Scheduling...' : 'Confirm Schedule'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setSelectedReport(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* Scheduled Reports Table */}
      <Card padding="md">
        <h3 className="text-sm font-bold text-gray-700 mb-3">Scheduled Reports</h3>
        {scheduled.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-xs">No scheduled reports yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 font-semibold text-gray-500">Report</th>
                  <th className="text-left py-2 font-semibold text-gray-500">Schedule</th>
                  <th className="text-left py-2 font-semibold text-gray-500">Recipients</th>
                  <th className="text-left py-2 font-semibold text-gray-500">Last Run</th>
                  <th className="text-right py-2 font-semibold text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {scheduled.map((s) => {
                  const tmpl = templates.find((t) => t.id === s.reportId);
                  return (
                    <tr key={s.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 text-gray-800 font-medium">{tmpl?.name ?? s.reportId}</td>
                      <td className="py-2 text-gray-600">{s.schedule}</td>
                      <td className="py-2 text-gray-600">{s.recipients.length > 0 ? s.recipients.join(', ') : '—'}</td>
                      <td className="py-2 text-gray-500">{s.lastRunAt ? new Date(s.lastRunAt).toLocaleDateString() : 'Never'}</td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => handleDeleteSchedule(s.id)}
                          className="text-red-500 hover:text-red-700 text-xs"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
