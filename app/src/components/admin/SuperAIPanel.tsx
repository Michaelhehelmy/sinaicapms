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

interface AIOverview {
  totalPredictions: number;
  totalAutomationRules: number;
  totalLogs: number;
  totalPriceRules: number;
  tenantBreakdown: Array<{
    tenant_id: string;
    tenant_name: string;
    prediction_count: number;
    automation_count: number;
  }>;
}

interface PredictionRecord {
  id: string;
  type: string;
  confidence: number;
  tenant_name: string;
  created_at: string;
  [key: string]: unknown;
}

const predictionColumns = [
  {
    key: 'type',
    header: 'Type',
    sortable: true,
    render: (r: PredictionRecord) => <Badge variant="info">{r.type || '—'}</Badge>,
  },
  {
    key: 'tenant_name',
    header: 'Tenant',
    sortable: true,
    render: (r: PredictionRecord) => <span className="text-gray-600">{r.tenant_name || '—'}</span>,
  },
  {
    key: 'confidence',
    header: 'Confidence',
    sortable: true,
    render: (r: PredictionRecord) => <span className="font-medium text-gray-800">{typeof r.confidence === 'number' ? `${(r.confidence * 100).toFixed(0)}%` : '—'}</span>,
  },
  {
    key: 'created_at',
    header: 'Created',
    sortable: true,
    render: (r: PredictionRecord) => <span className="text-gray-500">{r.created_at ? formatDate(r.created_at) : '—'}</span>,
  },
];

export default function SuperAIPanel() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [overview, setOverview] = useState<AIOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [predictions, setPredictions] = useState<PredictionRecord[]>([]);
  const [loadingPredictions, setLoadingPredictions] = useState(false);

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
      const data = await apiFetch<AIOverview>('/admin/ai/overview');
      setOverview(data);
    } catch (err) {
      showToast('Failed to load AI overview: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setLoadingOverview(false);
    }
  }, [showToast]);

  const loadPredictions = useCallback(async (tenantId?: string) => {
    setLoadingPredictions(true);
    try {
      const qs = tenantId ? `?tenantId=${tenantId}` : '';
      const data = await apiFetch<{ data: PredictionRecord[]; total: number }>(`/admin/ai/predictions${qs}`);
      setPredictions(data.data || []);
    } catch (err) {
      showToast('Failed to load predictions: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setLoadingPredictions(false);
    }
  }, [showToast]);

  useEffect(() => { loadTenants(); loadOverview(); }, [loadTenants, loadOverview]);
  useEffect(() => { loadPredictions(selectedTenantId || undefined); }, [selectedTenantId, loadPredictions]);

  const tenantOptions = [{ value: '', label: 'All Tenants' }, ...tenants.map((t) => ({ value: t.id, label: t.name }))];

  return (
    <div data-testid="super-ai-panel" aria-busy={loadingTenants || loadingOverview || undefined}>
      {!isSuperAdmin ? (
        <div className="text-center py-16">
          <h2 className="text-2xl font-bold text-gray-700 mb-2">Access Denied</h2>
          <p className="text-gray-500 text-sm">Super Admin access required.</p>
        </div>
      ) : loadingTenants || loadingOverview ? (
        <LoadingSpinner text="Loading AI data..." />
      ) : (
      <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">AI & Automation Overview</h2>
        <span className="text-sm text-gray-500">Cross-tenant predictions & automation</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Predictions" value={overview?.totalPredictions ?? 0} color="blue" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>} />
        <StatCard title="Automation Rules" value={overview?.totalAutomationRules ?? 0} color="green" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} />
        <StatCard title="AI Logs" value={overview?.totalLogs ?? 0} color="purple" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>} />
        <StatCard title="Price Rules" value={overview?.totalPriceRules ?? 0} color="yellow" icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>} />
      </div>

      {overview?.tenantBreakdown && overview.tenantBreakdown.length > 0 && (
        <Card padding="md" className="mb-6">
          <h3 className="text-sm font-bold text-gray-700 mb-3">AI Activity by Tenant</h3>
          <div className="space-y-2">
            {overview.tenantBreakdown.slice(0, 5).map((t) => (
              <div key={t.tenant_id} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{t.tenant_name}</span>
                <div className="flex items-center gap-4">
                  <span className="text-gray-500">{t.automation_count} rules</span>
                  <span className="font-medium text-gray-800">{t.prediction_count} predictions</span>
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
          <Button variant="success" size="md" loading={loadingPredictions} onClick={() => loadPredictions(selectedTenantId || undefined)}>Refresh</Button>
        </div>
      </Card>

      {loadingPredictions ? (
        <LoadingSpinner text="Loading predictions..." />
      ) : predictions.length === 0 ? (
        <Card padding="md"><EmptyState title="No predictions found" description="No AI predictions found for the selected filter." /></Card>
      ) : (
        <DataTable columns={predictionColumns} data={predictions} rowKey="id" size="md" />
      )}
      </>
      )}
    </div>
  );
}
