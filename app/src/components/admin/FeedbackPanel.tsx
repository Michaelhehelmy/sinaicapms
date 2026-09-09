import React, { useState, useCallback } from 'react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { DataTable } from '@/components/ui/DataTable';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { useFeedbackListQuery, useUpdateFeedbackStatusMutation } from '@/hooks/useQueryHooks';
import { getFeedback } from '@/lib/api';
import type { FeedbackDetail, FeedbackReport, FeedbackStatus } from '@/lib/api';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'archived', label: 'Archived' },
];

const AUTHOR_OPTIONS = [
  { value: '', label: 'All Surfaces' },
  { value: 'admin', label: 'Admin' },
  { value: 'pos', label: 'POS' },
  { value: 'public', label: 'Public' },
];

const STATUS_VARIANTS: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
  open: 'error',
  in_progress: 'warning',
  resolved: 'success',
  archived: 'default',
};

const CATEGORY_VARIANTS: Record<string, 'default' | 'warning' | 'info' | 'error'> = {
  bug: 'error',
  missing: 'warning',
  flow: 'info',
};

function CategoryLabel({ item }: { item: FeedbackReport }) {
  return <Badge variant={CATEGORY_VARIANTS[item.category] || 'default'} size="sm">{item.category}</Badge>;
}

export default function FeedbackPanel() {
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [loadingShot, setLoadingShot] = useState(false);

  const { data, isLoading } = useFeedbackListQuery({
    page,
    pageSize: 25,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.authorType ? { authorType: filters.authorType } : {}),
  });

  const updateMutation = useUpdateFeedbackStatusMutation();

  const updateFilter = (key: string, value: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
    setPage(1);
  };

  const openDetail = useCallback(async (row: FeedbackReport) => {
    setExpandedRow((cur) => {
      if (cur === row.id) return null;
      return row.id;
    });
    setScreenshot(null);
    // On expand, fetch the full detail (list rows omit the payload).
    try {
      setLoadingShot(true);
      const detail: FeedbackDetail = await getFeedback(row.id);
      setScreenshot(detail.screenshot || null);
    } catch {
      setScreenshot(null);
    } finally {
      setLoadingShot(false);
    }
  }, []);

  const changeStatus = useCallback(async (row: FeedbackReport, status: FeedbackStatus) => {
    try {
      await updateMutation.mutateAsync({ id: row.id, status });
      showToast(`Marked ${status.replace('_', ' ')}`, 'success');
    } catch {
      showToast('Failed to update feedback status', 'error');
    }
  }, [updateMutation, showToast]);

  const columns = [
    {
      key: 'createdAt',
      header: 'Received',
      render: (item: Record<string, unknown>) => {
        const date = new Date(String(item.createdAt || ''));
        return (
          <span className="text-sm text-gray-600">
            {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        );
      },
      width: '150px',
    },
    {
      key: 'category',
      header: 'Type',
      render: (item: Record<string, unknown>) => <CategoryLabel item={item as unknown as FeedbackReport} />,
      width: '110px',
    },
    {
      key: 'message',
      header: 'Message',
      render: (item: Record<string, unknown>) => (
        <span className="block max-w-[360px] truncate text-sm text-gray-800">{String(item.message || '')}</span>
      ),
    },
    {
      key: 'authorType',
      header: 'Surface',
      render: (item: Record<string, unknown>) => (
        <span className="text-sm capitalize text-gray-600">{String(item.authorType || 'public')}</span>
      ),
    },
    {
      key: 'authorName',
      header: 'Tester',
      render: (item: Record<string, unknown>) => (
        <span className="text-sm text-gray-600">{String(item.authorName || item.authorEmail || '-')}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: Record<string, unknown>) => (
        <Badge variant={STATUS_VARIANTS[String(item.status)] || 'default'} size="sm">
          {String(item.status).replace('_', ' ')}
        </Badge>
      ),
    },
  ];

  const expandedRowData: FeedbackReport | null = (data?.data.find((r) => r.id === expandedRow) as FeedbackReport) || null;

  return (
    <div className="space-y-6" data-testid="feedback-panel">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Human-Testing Feedback</h2>
          <p className="text-sm text-gray-500">
            Reports sent through the debug widget by testers — screenshot, message and their point of view.
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-40">
            <Select
              label="Status"
              options={STATUS_OPTIONS}
              value={filters.status || ''}
              onChange={(e) => updateFilter('status', e.target.value)}
            />
          </div>
          <div className="w-40">
            <Select
              label="Surface"
              options={AUTHOR_OPTIONS}
              value={filters.authorType || ''}
              onChange={(e) => updateFilter('authorType', e.target.value)}
            />
          </div>
          {(filters.status || filters.authorType) && (
            <Button size="sm" variant="ghost" onClick={() => { setFilters({}); setPage(1); }}>
              Clear Filters
            </Button>
          )}
        </div>
      </Card>

      {/* Data table */}
      <Card padding="none">
        {isLoading ? (
          <div className="p-8"><LoadingSpinner text="Loading feedback..." /></div>
        ) : (
          <DataTable
            columns={columns}
            data={(data?.data || []) as unknown as Record<string, unknown>[]}
            rowKey="id"
            emptyMessage="No feedback reports yet — testers will appear here as they send reports."
            pagination={data ? {
              page: data.page,
              total: data.total,
              pageSize: data.pageSize,
              onChange: setPage,
            } : undefined}
            onRowClick={(item) => openDetail(item as unknown as FeedbackReport)}
          />
        )}
      </Card>

      {/* Expanded detail */}
      {expandedRowData && (
        <Card>
          <CardHeader>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Report detail</h3>
              <p className="text-xs text-gray-500">{expandedRowData.id}</p>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">What happened</p>
                <p className="mt-1 text-sm text-gray-800">{expandedRowData.message}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Personal point of view</p>
                <p className="mt-1 text-sm text-gray-600">{expandedRowData.personalView || '—'}</p>
              </div>
            </div>

            <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium text-gray-400">Page</dt>
                <dd className="mt-0.5 break-all text-xs text-gray-700">{expandedRowData.pageUrl}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-400">Tester</dt>
                <dd className="mt-0.5 text-gray-700">
                  {expandedRowData.authorName || 'Anonymous'}
                  {expandedRowData.authorEmail ? ` (${expandedRowData.authorEmail})` : ''}
                  {expandedRowData.role ? ` — ${expandedRowData.role}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-400">Browser</dt>
                <dd className="mt-0.5 max-h-16 overflow-hidden text-xs text-gray-500">{expandedRowData.userAgent || '—'}</dd>
              </div>
              {expandedRowData.tenantId && (
                <div>
                  <dt className="text-xs font-medium text-gray-400">Tenant</dt>
                  <dd className="mt-0.5 text-xs text-gray-500">{expandedRowData.tenantId}</dd>
                </div>
              )}
            </dl>

            {/* Screenshot */}
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Screenshot</p>
              {loadingShot ? (
                <p className="mt-1 text-xs text-gray-400">Loading screenshot…</p>
              ) : screenshot ? (
                <a href={screenshot} target="_blank" rel="noreferrer" data-testid="feedback-screenshot-link">
                  <img
                    src={screenshot}
                    alt="Reported issue screenshot"
                    className="mt-1 max-h-64 rounded-lg border border-warm-200 shadow-sm"
                    data-testid="feedback-screenshot-img"
                  />
                </a>
              ) : (
                <p className="mt-1 text-xs text-gray-400">No screenshot attached.</p>
              )}
            </div>

            {/* Actions */}
            <div className="mt-4 flex flex-wrap gap-2">
              {expandedRowData.status !== 'open' && (
                <Button variant="ghost" size="sm" onClick={() => changeStatus(expandedRowData, 'open')}>
                  Reopen
                </Button>
              )}
              {expandedRowData.status !== 'in_progress' && (
                <Button variant="secondary" size="sm" onClick={() => changeStatus(expandedRowData, 'in_progress')}>
                  In Progress
                </Button>
              )}
              {expandedRowData.status !== 'resolved' && (
                <Button variant="success" size="sm" onClick={() => changeStatus(expandedRowData, 'resolved')}>
                  Resolved
                </Button>
              )}
              {expandedRowData.status !== 'archived' && (
                <Button variant="ghost" size="sm" onClick={() => changeStatus(expandedRowData, 'archived')}>
                  Archive
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}