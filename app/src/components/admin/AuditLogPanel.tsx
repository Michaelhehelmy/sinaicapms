import React, { useState, useCallback } from 'react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { DataTable } from '@/components/ui/DataTable';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { useAdminAuditQuery } from '@/hooks/useQueryHooks';

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
];

const ENTITY_OPTIONS = [
  { value: '', label: 'All Entities' },
  { value: 'tenant', label: 'Tenant' },
  { value: 'project', label: 'Project' },
  { value: 'admin', label: 'Admin' },
];

const ACTION_VARIANTS: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
  create: 'success',
  update: 'warning',
  delete: 'error',
};

function JsonDiff({ oldValues, newValues }: { oldValues: unknown; newValues: unknown }) {
  const oldObj = typeof oldValues === 'string' ? (() => { try { return JSON.parse(oldValues); } catch { return null; } })() : oldValues;
  const newObj = typeof newValues === 'string' ? (() => { try { return JSON.parse(newValues); } catch { return null; } })() : newValues;

  if (!oldObj && !newObj) return <span className="text-gray-400 text-xs">No changes recorded</span>;

  const oldKeys = oldObj && typeof oldObj === 'object' ? Object.keys(oldObj) : [];
  const newKeys = newObj && typeof newObj === 'object' ? Object.keys(newObj) : [];
  const allKeys = [...new Set([...oldKeys, ...newKeys])];

  if (allKeys.length === 0) return <span className="text-gray-400 text-xs">No changes recorded</span>;

  return (
    <div className="text-xs font-mono bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
      {allKeys.map((key) => {
        const oldVal = oldObj?.[key];
        const newVal = newObj?.[key];
        const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);
        return (
          <div key={key} className={`flex gap-2 ${changed ? 'bg-yellow-50 -mx-1 px-1 rounded' : ''}`}>
            <span className="text-gray-600 shrink-0">{key}:</span>
            {changed && oldVal !== undefined && (
              <span className="text-red-600 line-through">{JSON.stringify(oldVal)}</span>
            )}
            {changed && <span className="text-green-600">{JSON.stringify(newVal)}</span>}
            {!changed && <span className="text-gray-500">{JSON.stringify(newVal)}</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function AuditLogPanel() {
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const queryParams = {
    page: String(page),
    pageSize: '25',
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
  };

  const { data, isLoading } = useAdminAuditQuery(queryParams);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      // The export endpoint returns a CSV blob
      const url = `/api/admin/audit/export?${new URLSearchParams(params).toString()}`;
      const token = localStorage.getItem('admin_access_token');
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
      showToast('Audit log exported', 'success');
    } catch (err) {
      showToast('Failed to export: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setExporting(false);
    }
  }, [filters, showToast]);

  const updateFilter = (key: string, value: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
    setPage(1);
  };

  const columns = [
    {
      key: 'created_at',
      header: 'Time',
      render: (item: Record<string, unknown>) => {
        const date = new Date(String(item.created_at || ''));
        return (
          <span className="text-sm text-gray-600">
            {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        );
      },
      sortable: true,
      width: '160px',
    },
    {
      key: 'tenant_name',
      header: 'Tenant',
      render: (item: Record<string, unknown>) => (
        <span className="text-sm font-medium text-gray-800">
          {String(item.tenant_name || item.tenant_id || '-')}
        </span>
      ),
    },
    {
      key: 'user_email',
      header: 'User',
      render: (item: Record<string, unknown>) => (
        <span className="text-sm text-gray-600">{String(item.user_email || item.user_id || '-')}</span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (item: Record<string, unknown>) => (
        <Badge variant={ACTION_VARIANTS[String(item.action)] || 'default'} size="sm">
          {String(item.action)}
        </Badge>
      ),
    },
    {
      key: 'entity_type',
      header: 'Entity Type',
      render: (item: Record<string, unknown>) => (
        <span className="text-sm text-gray-600 capitalize">{String(item.entity_type)}</span>
      ),
    },
    {
      key: 'entity_id',
      header: 'Entity ID',
      render: (item: Record<string, unknown>) => (
        <span className="text-xs font-mono text-gray-500">{String(item.entity_id).slice(0, 16)}...</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Audit Log</h2>
        <Button
          onClick={handleExport}
          disabled={exporting}
          variant="secondary"
          size="sm"
          data-testid="audit-export-btn"
        >
          {exporting ? 'Exporting...' : 'Export CSV'}
        </Button>
      </div>

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-40">
            <Select
              label="Action"
              options={ACTION_OPTIONS}
              value={filters.action || ''}
              onChange={(e) => updateFilter('action', e.target.value)}
              placeholder="All Actions"
            />
          </div>
          <div className="w-40">
            <Select
              label="Entity Type"
              options={ENTITY_OPTIONS}
              value={filters.entityType || ''}
              onChange={(e) => updateFilter('entityType', e.target.value)}
              placeholder="All Entities"
            />
          </div>
          <div className="w-40">
            <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
            <input
              type="date"
              value={filters.startDate || ''}
              onChange={(e) => updateFilter('startDate', e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="w-40">
            <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
            <input
              type="date"
              value={filters.endDate || ''}
              onChange={(e) => updateFilter('endDate', e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
            />
          </div>
          {Object.keys(filters).length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setFilters({}); setPage(1); }}
            >
              Clear Filters
            </Button>
          )}
        </div>
      </Card>

      {/* Data Table */}
      <Card padding="none">
        {isLoading ? (
          <div className="p-8"><LoadingSpinner text="Loading audit logs..." /></div>
        ) : (
          <DataTable
            columns={columns}
            data={(data?.data || []) as unknown as Record<string, unknown>[]}
            rowKey="id"
            emptyMessage="No audit logs found"
            pagination={data ? {
              page: data.page,
              total: data.total,
              pageSize: data.pageSize,
              onChange: setPage,
            } : undefined}
            onRowClick={(item) => {
              const id = String(item.id);
              setExpandedRow(expandedRow === id ? null : id);
            }}
          />
        )}
      </Card>

      {/* Expanded row details */}
      {expandedRow && data?.data && (() => {
        const row = data.data.find((r) => String(r.id) === expandedRow);
        if (!row) return null;
        return (
          <Card>
            <CardHeader>
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Audit Entry Details</h3>
                <p className="text-xs text-gray-500">{String(row.id)}</p>
              </div>
            </CardHeader>
            <CardBody>
              <JsonDiff oldValues={row.oldValues} newValues={row.newValues} />
            </CardBody>
          </Card>
        );
      })()}
    </div>
  );
}
