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

interface CRMOverview {
  totalContacts: number;
  totalLeads: number;
  openOpportunities: number;
  openTickets: number;
  tenantBreakdown: Array<{
    tenant_id: string;
    tenant_name: string;
    contact_count: number;
    lead_count: number;
    opportunity_count: number;
  }>;
}

interface ContactRecord {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  tenant_name: string;
  created_at: string;
  [key: string]: unknown;
}

const contactColumns = [
  {
    key: 'first_name',
    header: 'Name',
    sortable: true,
    render: (r: ContactRecord) => <span className="font-medium text-gray-800">{[r.first_name, r.last_name].filter(Boolean).join(' ') || '—'}</span>,
  },
  {
    key: 'tenant_name',
    header: 'Tenant',
    sortable: true,
    render: (r: ContactRecord) => <span className="text-gray-600">{r.tenant_name || '—'}</span>,
  },
  {
    key: 'email',
    header: 'Email',
    render: (r: ContactRecord) => <span className="text-gray-600">{r.email || '—'}</span>,
  },
  {
    key: 'company',
    header: 'Company',
    render: (r: ContactRecord) => <span className="text-gray-600">{r.company || '—'}</span>,
  },
  {
    key: 'created_at',
    header: 'Created',
    sortable: true,
    render: (r: ContactRecord) => <span className="text-gray-500">{r.created_at ? formatDate(r.created_at) : '—'}</span>,
  },
];

export default function SuperCRMPanel() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [overview, setOverview] = useState<CRMOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

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
      const data = await apiFetch<CRMOverview>('/admin/crm/overview');
      setOverview(data);
    } catch (err) {
      showToast('Failed to load CRM overview: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setLoadingOverview(false);
    }
  }, [showToast]);

  const loadContacts = useCallback(async (tenantId?: string) => {
    setLoadingContacts(true);
    try {
      const qs = tenantId ? `?tenantId=${tenantId}` : '';
      const data = await apiFetch<{ data: ContactRecord[]; total: number }>(`/admin/crm/contacts${qs}`);
      setContacts(data.data || []);
    } catch (err) {
      showToast('Failed to load contacts: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setLoadingContacts(false);
    }
  }, [showToast]);

  useEffect(() => { loadTenants(); loadOverview(); }, [loadTenants, loadOverview]);
  useEffect(() => { loadContacts(selectedTenantId || undefined); }, [selectedTenantId, loadContacts]);

  const tenantOptions = [{ value: '', label: 'All Tenants' }, ...tenants.map((t) => ({ value: t.id, label: t.name }))];

  return (
    <div data-testid="super-crm-panel" aria-busy={loadingTenants || loadingOverview || undefined}>
      {!isSuperAdmin ? (
        <div className="text-center py-16">
          <h2 className="text-2xl font-bold text-gray-700 mb-2">Access Denied</h2>
          <p className="text-gray-500 text-sm">Super Admin access required.</p>
        </div>
      ) : loadingTenants || loadingOverview ? (
        <LoadingSpinner text="Loading CRM data..." />
      ) : (
      <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">CRM Overview</h2>
        <span className="text-sm text-gray-500">Cross-tenant contacts & opportunities</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Contacts" value={overview?.totalContacts ?? 0} color="blue" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} />
        <StatCard title="Leads" value={overview?.totalLeads ?? 0} color="green" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>} />
        <StatCard title="Open Opps" value={overview?.openOpportunities ?? 0} color="yellow" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard title="Open Tickets" value={overview?.openTickets ?? 0} color="red" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>} />
      </div>

      {overview?.tenantBreakdown && overview.tenantBreakdown.length > 0 && (
        <Card padding="md" className="mb-6">
          <h3 className="text-sm font-bold text-gray-700 mb-3">CRM by Tenant</h3>
          <div className="space-y-2">
            {overview.tenantBreakdown.slice(0, 5).map((t) => (
              <div key={t.tenant_id} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{t.tenant_name}</span>
                <div className="flex items-center gap-4">
                  <span className="text-gray-500">{t.lead_count} leads</span>
                  <span className="text-gray-500">{t.opportunity_count} opps</span>
                  <span className="font-medium text-gray-800">{t.contact_count} contacts</span>
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
          <Button variant="success" size="md" loading={loadingContacts} onClick={() => loadContacts(selectedTenantId || undefined)}>Refresh</Button>
        </div>
      </Card>

      {loadingContacts ? (
        <LoadingSpinner text="Loading contacts..." />
      ) : contacts.length === 0 ? (
        <Card padding="md"><EmptyState title="No contacts found" description="No contacts found for the selected filter." /></Card>
      ) : (
        <DataTable columns={contactColumns} data={contacts} rowKey="id" size="md" />
      )}
      </>
      )}
    </div>
  );
}
