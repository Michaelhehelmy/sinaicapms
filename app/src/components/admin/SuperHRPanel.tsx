import React, { useState, useEffect, useCallback } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StatCard } from '@/components/ui/StatCard';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { getAdminTenants } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface TenantRecord {
  id: string;
  name: string;
  subdomain: string;
  status: string;
  [key: string]: unknown;
}

interface HROverview {
  totalEmployees: number;
  activeEmployees: number;
  pendingLeaveRequests: number;
  totalPayrollRuns: number;
  tenantBreakdown: Array<{
    tenant_id: string;
    tenant_name: string;
    employee_count: number;
    active_count: number;
  }>;
}

interface EmployeeRecord {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  department: string;
  position: string;
  status: string;
  tenant_name: string;
  hire_date: string;
  [key: string]: unknown;
}

const employeeColumns = [
  {
    key: 'first_name',
    header: 'Name',
    sortable: true,
    render: (r: EmployeeRecord) => <span className="font-medium text-gray-800">{[r.first_name, r.last_name].filter(Boolean).join(' ') || '—'}</span>,
  },
  {
    key: 'tenant_name',
    header: 'Tenant',
    sortable: true,
    render: (r: EmployeeRecord) => <span className="text-gray-600">{r.tenant_name || '—'}</span>,
  },
  {
    key: 'department',
    header: 'Department',
    sortable: true,
    render: (r: EmployeeRecord) => <span className="text-gray-600">{r.department || '—'}</span>,
  },
  {
    key: 'position',
    header: 'Position',
    render: (r: EmployeeRecord) => <span className="text-gray-600">{r.position || '—'}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (r: EmployeeRecord) => <Badge variant={r.status === 'active' ? 'success' : 'info'}>{r.status}</Badge>,
  },
  {
    key: 'hire_date',
    header: 'Hire Date',
    sortable: true,
    render: (r: EmployeeRecord) => <span className="text-gray-500">{r.hire_date ? formatDate(r.hire_date) : '—'}</span>,
  },
];

export default function SuperHRPanel() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [overview, setOverview] = useState<HROverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  const isSuperAdmin = user?.role === 'super_admin';

  const loadTenants = useCallback(async () => {
    try {
      const data = await getAdminTenants();
      const list = Array.isArray(data) ? data : Array.isArray((data as { data?: unknown })?.data) ? ((data as { data: TenantRecord[] }).data) : [];
      setTenants(list);
    } catch (err) {
      showToast('Failed to load tenants: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setLoadingTenants(false);
    }
  }, [showToast]);

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const data = await apiFetch<HROverview>('/admin/hr/overview');
      setOverview(data);
    } catch (err) {
      showToast('Failed to load HR overview: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setLoadingOverview(false);
    }
  }, [showToast]);

  const loadEmployees = useCallback(async (tenantId?: string) => {
    setLoadingEmployees(true);
    try {
      const qs = tenantId ? `?tenantId=${tenantId}` : '';
      const data = await apiFetch<{ data: EmployeeRecord[]; total: number }>(`/admin/hr/employees${qs}`);
      setEmployees(data.data || []);
    } catch (err) {
      showToast('Failed to load employees: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setLoadingEmployees(false);
    }
  }, [showToast]);

  useEffect(() => { loadTenants(); loadOverview(); }, [loadTenants, loadOverview]);
  useEffect(() => { loadEmployees(selectedTenantId || undefined); }, [selectedTenantId, loadEmployees]);

  const tenantOptions = [{ value: '', label: 'All Tenants' }, ...tenants.map((t) => ({ value: t.id, label: t.name }))];

  return (
    <div data-testid="super-hr-panel" aria-busy={loadingTenants || loadingOverview || undefined}>
      {!isSuperAdmin ? (
        <div className="text-center py-16">
          <h2 className="text-2xl font-bold text-gray-700 mb-2">Access Denied</h2>
          <p className="text-gray-500 text-sm">Super Admin access required.</p>
        </div>
      ) : loadingTenants || loadingOverview ? (
        <LoadingSpinner text="Loading HR data..." />
      ) : (
      <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">HR & Payroll Overview</h2>
        <span className="text-sm text-gray-500">Cross-tenant workforce management</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Employees" value={overview?.totalEmployees ?? 0} color="blue" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>} />
        <StatCard title="Active" value={overview?.activeEmployees ?? 0} color="green" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard title="Pending Leave" value={overview?.pendingLeaveRequests ?? 0} color="yellow" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard title="Payroll Runs" value={overview?.totalPayrollRuns ?? 0} color="purple" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>} />
      </div>

      {overview?.tenantBreakdown && overview.tenantBreakdown.length > 0 && (
        <Card padding="md" className="mb-6">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Employees by Tenant</h3>
          <div className="space-y-2">
            {overview.tenantBreakdown.slice(0, 5).map((t) => (
              <div key={t.tenant_id} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{t.tenant_name}</span>
                <div className="flex items-center gap-4">
                  <span className="text-gray-500">{t.active_count} active</span>
                  <span className="font-medium text-gray-800">{t.employee_count} total</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card padding="md" className="mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="min-w-[200px]">
            <Select label="Filter by Tenant" options={tenantOptions} value={selectedTenantId} onChange={(e) => setSelectedTenantId(e.target.value)} />
          </div>
          <Button variant="success" size="md" loading={loadingEmployees} onClick={() => loadEmployees(selectedTenantId || undefined)}>Refresh</Button>
        </div>
      </Card>

      {loadingEmployees ? (
        <LoadingSpinner text="Loading employees..." />
      ) : employees.length === 0 ? (
        <Card padding="md"><EmptyState title="No employees found" description="No employees found for the selected filter." /></Card>
      ) : (
        <DataTable columns={employeeColumns} data={employees} rowKey="id" size="md" />
      )}
      </>
      )}
    </div>
  );
}
