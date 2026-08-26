import React, { useState, useCallback } from 'react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { DataTable } from '@/components/ui/DataTable';
import { FormModal } from '@/components/ui/FormModal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { useAdminSubscriptionsQuery, queryKeys } from '@/hooks/useQueryHooks';
import { updateAdminSubscription, cancelAdminSubscription, resumeAdminSubscription } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/utils';

const PLAN_OPTIONS = [
  { value: '', label: 'All Plans' },
  { value: 'free', label: 'Free' },
  { value: 'starter', label: 'Starter' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
];

const PLAN_BADGE_VARIANTS: Record<string, 'default' | 'info' | 'success' | 'warning'> = {
  free: 'default',
  starter: 'info',
  pro: 'success',
  enterprise: 'warning',
};

const STATUS_BADGE_VARIANTS: Record<string, 'success' | 'error' | 'warning'> = {
  active: 'success',
  canceled: 'error',
  past_due: 'warning',
};

const PLAN_UPGRADE_OPTIONS = [
  { value: 'free', label: 'Free (100 bookings/mo)' },
  { value: 'starter', label: 'Starter (1,000 bookings/mo)' },
  { value: 'pro', label: 'Pro (10,000 bookings/mo)' },
  { value: 'enterprise', label: 'Enterprise (Unlimited)' },
];

function UsageBar({ percent }: { percent: number }) {
  const color = percent > 90 ? 'bg-red-500' : percent > 70 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 bg-gray-200 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <span className="text-xs text-gray-500">{percent}%</span>
    </div>
  );
}

export default function SubscriptionsPanel() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});

  // Modal state
  const [editingTenant, setEditingTenant] = useState<{ tenantId: string; tenantName: string; plan: string } | null>(null);
  const [newPlan, setNewPlan] = useState('');
  const [saving, setSaving] = useState(false);

  // Confirmation state
  const [confirmAction, setConfirmAction] = useState<{ type: 'cancel' | 'resume'; tenantId: string; tenantName: string } | null>(null);

  const queryParams = {
    page: String(page),
    pageSize: '20',
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
  };

  const { data, isLoading } = useAdminSubscriptionsQuery(queryParams);

  const updateFilter = (key: string, value: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
    setPage(1);
  };

  const handleUpgrade = useCallback(async () => {
    if (!editingTenant || !newPlan) return;
    setSaving(true);
    try {
      await updateAdminSubscription(editingTenant.tenantId, { plan: newPlan });
      queryClient.invalidateQueries({ queryKey: queryKeys.adminSubscriptions() });
      showToast(`Subscription updated to ${newPlan}`, 'success');
      setEditingTenant(null);
    } catch (err) {
      showToast('Failed to update: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setSaving(false);
    }
  }, [editingTenant, newPlan, queryClient, showToast]);

  const handleConfirmAction = useCallback(async () => {
    if (!confirmAction) return;
    setSaving(true);
    try {
      if (confirmAction.type === 'cancel') {
        await cancelAdminSubscription(confirmAction.tenantId);
        showToast('Subscription canceled', 'success');
      } else {
        await resumeAdminSubscription(confirmAction.tenantId);
        showToast('Subscription resumed', 'success');
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.adminSubscriptions() });
      setConfirmAction(null);
    } catch (err) {
      showToast('Action failed: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setSaving(false);
    }
  }, [confirmAction, queryClient, showToast]);

  const columns = [
    {
      key: 'tenant_name',
      header: 'Tenant',
      render: (item: Record<string, unknown>) => (
        <div>
          <div className="font-medium text-gray-800 text-sm">{String(item.tenantName || item.tenant_id)}</div>
          <div className="text-xs text-gray-500">{String(item.tenantId)}</div>
        </div>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      render: (item: Record<string, unknown>) => (
        <Badge variant={PLAN_BADGE_VARIANTS[String(item.plan)] || 'default'} size="sm">
          {String(item.plan).charAt(0).toUpperCase() + String(item.plan).slice(1)}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: Record<string, unknown>) => (
        <Badge variant={STATUS_BADGE_VARIANTS[String(item.status)] || 'default'} size="sm" dot>
          {String(item.status).replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'usage',
      header: 'Usage',
      render: (item: Record<string, unknown>) => {
        const usage = item.usage as { bookings: number; limit: number; percent: number } | undefined;
        return (
          <div>
            <div className="text-sm text-gray-700">{usage?.bookings ?? 0} / {usage?.limit ?? 0}</div>
            <UsageBar percent={usage?.percent ?? 0} />
          </div>
        );
      },
    },
    {
      key: 'total_paid',
      header: 'Total Paid',
      render: (item: Record<string, unknown>) => (
        <span className="text-sm font-medium text-gray-800">
          {formatCurrency(Number(item.totalPaid || 0))}
        </span>
      ),
    },
  ];

  const actions = (item: Record<string, unknown>) => (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="secondary"
        onClick={(e) => {
          e.stopPropagation();
          setEditingTenant({
            tenantId: String(item.tenantId),
            tenantName: String(item.tenantName || item.tenantId),
            plan: String(item.plan),
          });
          setNewPlan(String(item.plan));
        }}
      >
        Change Plan
      </Button>
      {String(item.status) === 'active' ? (
        <Button
          size="sm"
          variant="ghost"
          className="text-red-600 hover:text-red-700"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmAction({
              type: 'cancel',
              tenantId: String(item.tenantId),
              tenantName: String(item.tenantName || item.tenantId),
            });
          }}
        >
          Cancel
        </Button>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="text-green-600 hover:text-green-700"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmAction({
              type: 'resume',
              tenantId: String(item.tenantId),
              tenantName: String(item.tenantName || item.tenantId),
            });
          }}
        >
          Resume
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Subscriptions</h2>
        <div className="text-sm text-gray-500">
          {data?.total || 0} total subscriptions
        </div>
      </div>

      {/* Plan Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {['free', 'starter', 'pro', 'enterprise'].map((plan) => {
          const count = data?.data?.filter((s) => s.plan === plan).length || 0;
          return (
            <Card key={plan} padding="sm" hover>
              <div className="text-center">
                <Badge variant={PLAN_BADGE_VARIANTS[plan]} size="sm" className="mb-1">
                  {plan.charAt(0).toUpperCase() + plan.slice(1)}
                </Badge>
                <div className="text-2xl font-bold text-gray-800">{count}</div>
                <div className="text-xs text-gray-500">tenants</div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-40">
            <Select
              label="Plan"
              options={PLAN_OPTIONS}
              value={filters.plan || ''}
              onChange={(e) => updateFilter('plan', e.target.value)}
            />
          </div>
          <div className="w-40">
            <Select
              label="Status"
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'active', label: 'Active' },
                { value: 'canceled', label: 'Canceled' },
                { value: 'past_due', label: 'Past Due' },
              ]}
              value={filters.status || ''}
              onChange={(e) => updateFilter('status', e.target.value)}
            />
          </div>
          <div className="w-48">
            <label className="block text-xs font-medium text-gray-600 mb-1">Search</label>
            <input
              type="text"
              placeholder="Tenant name..."
              value={filters.search || ''}
              onChange={(e) => updateFilter('search', e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
            />
          </div>
          {Object.keys(filters).length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => { setFilters({}); setPage(1); }}>
              Clear
            </Button>
          )}
        </div>
      </Card>

      {/* Data Table */}
      <Card padding="none">
        {isLoading ? (
          <div className="p-8"><LoadingSpinner text="Loading subscriptions..." /></div>
        ) : (
          <DataTable
            columns={columns}
            data={(data?.data || []) as unknown as Record<string, unknown>[]}
            rowKey="tenantId"
            emptyMessage="No subscriptions found"
            actions={actions}
            pagination={data ? {
              page: data.page,
              total: data.total,
              pageSize: data.pageSize,
              onChange: setPage,
            } : undefined}
          />
        )}
      </Card>

      {/* Change Plan Modal */}
      <FormModal
        open={!!editingTenant}
        title={`Change Plan — ${editingTenant?.tenantName || ''}`}
        onClose={() => setEditingTenant(null)}
        onSubmit={handleUpgrade}
        submitLabel={saving ? 'Updating...' : 'Update Plan'}
        submitDisabled={saving || newPlan === editingTenant?.plan}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Plan</label>
            <Badge variant={PLAN_BADGE_VARIANTS[editingTenant?.plan || 'default']} size="md">
              {editingTenant?.plan?.charAt(0).toUpperCase()}{editingTenant?.plan?.slice(1)}
            </Badge>
          </div>
          <div>
            <Select
              label="New Plan"
              options={PLAN_UPGRADE_OPTIONS}
              value={newPlan}
              onChange={(e) => setNewPlan(e.target.value)}
            />
          </div>
        </div>
      </FormModal>

      {/* Confirmation Dialog */}
      <FormModal
        open={!!confirmAction}
        title={confirmAction?.type === 'cancel' ? 'Cancel Subscription' : 'Resume Subscription'}
        onClose={() => setConfirmAction(null)}
        onSubmit={handleConfirmAction}
        submitLabel={saving ? 'Processing...' : (confirmAction?.type === 'cancel' ? 'Cancel Subscription' : 'Resume Subscription')}
        submitDisabled={saving}
        danger={confirmAction?.type === 'cancel'}
        size="sm"
      >
        <p className="text-sm text-gray-600">
          {confirmAction?.type === 'cancel'
            ? `Are you sure you want to cancel the subscription for ${confirmAction?.tenantName}? This will revoke their access to paid features.`
            : `Resume the subscription for ${confirmAction?.tenantName}? They will regain access to their current plan features.`}
        </p>
      </FormModal>
    </div>
  );
}
