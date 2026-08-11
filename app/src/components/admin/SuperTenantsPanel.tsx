import React, { useEffect, useState, useCallback } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/auth';
import { updateAdminTenant, getAdminTenants, getAdmins, updateAdminUser } from '@/lib/api';
import TenantDrilldown from './TenantDrilldown';

interface TenantRecord {
  id: string;
  name: string;
  subdomain: string;
  customDomain: string | null;
  location: string;
  phone: string;
  email: string;
  status: string;
  currency: string | null;
  type: string;
  [key: string]: unknown;
}

interface EditForm {
  adminEmail: string;
  adminPassword: string;
  adminFirstName: string;
  adminLastName: string;
  type: string;
}

const TENANT_TYPE_VALUES = ['camp', 'supermarket', 'transportation', 'other'] as const;

const TENANT_TYPE_LABELS: Record<string, string> = {
  camp: 'Camp',
  supermarket: 'Supermarket',
  transportation: 'Transportation',
  other: 'Other',
};

export default function SuperTenantsPanel() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm>({
    adminEmail: '',
    adminPassword: '',
    adminFirstName: '',
    adminLastName: '',
    type: 'camp',
  });
  const [saving, setSaving] = useState(false);
  const [admins, setAdmins] = useState<Array<{id: string; tenantId: string; email: string; role: string; firstName: string; lastName: string; isActive: number}>>([]);
  const [showAdmins, setShowAdmins] = useState(false);
  const [drillTenant, setDrillTenant] = useState<TenantRecord | null>(null);

  const isSuperAdmin = user?.role === 'super_admin';

  const loadTenants = useCallback(async () => {
    try {
      // T6: use the dedicated paginated super-admin endpoint
      const data = await getAdminTenants();
      setTenants(Array.isArray(data) ? data : Array.isArray((data as { data?: unknown })?.data) ? ((data as { data: TenantRecord[] }).data) : []);
    } catch (err) {
      showToast('Failed to load tenants: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  const loadAdmins = useCallback(async () => {
    try {
      // T6: getAdmins returns { data, total, page, pageSize, hasMore }
      const data = await getAdmins();
      const list = Array.isArray(data) ? data : Array.isArray((data as { data?: unknown })?.data) ? ((data as { data: Array<{id: string; tenantId: string; email: string; role: string; firstName: string; lastName: string; isActive: number}> }).data) : [];
      setAdmins(list);
    } catch (err) {
      showToast('Failed to load admins: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [showToast]);

  useEffect(() => { if (showAdmins) loadAdmins(); }, [showAdmins, loadAdmins]);

  const toggleAdminActive = async (adminId: string, currentActive: number) => {
    try {
      // T8-C: AdminUpdateRequest.isActive is boolean — backend zod rejects numbers
      await updateAdminUser(adminId, { isActive: !currentActive });
      showToast(`Admin ${currentActive ? 'deactivated' : 'activated'}`, 'success');
      loadAdmins();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  };

  const typeLabel = (value?: string) => {
    const v = value || 'camp';
    return TENANT_TYPE_LABELS[v] ?? v;
  };

  const startEdit = (tenant: TenantRecord) => {
    setEditingId(tenant.id);
    setForm({
      adminEmail: '',
      adminPassword: '',
      adminFirstName: '',
      adminLastName: '',
      type: tenant.type || 'camp',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ adminEmail: '', adminPassword: '', adminFirstName: '', adminLastName: '', type: 'camp' });
  };

  const saveTenant = async (tenantId: string) => {
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (form.adminEmail.trim()) body.adminEmail = form.adminEmail.trim();
      if (form.adminPassword.trim()) body.adminPassword = form.adminPassword.trim();
      if (form.adminFirstName.trim()) body.adminFirstName = form.adminFirstName.trim();
      if (form.adminLastName.trim()) body.adminLastName = form.adminLastName.trim();
      const current = tenants.find((x) => x.id === tenantId);
      if (form.type && (!current || form.type !== (current.type || 'camp'))) body.type = form.type;

      if (Object.keys(body).length === 0) {
        showToast('No changes to save', 'info');
        cancelEdit();
        return;
      }

      await updateAdminTenant(tenantId, body);
      showToast(`Tenant "${tenantId}" updated successfully`, 'success');
      cancelEdit();
      loadTenants();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (tenantId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      await updateAdminTenant(tenantId, { status: newStatus });
      showToast(`Tenant ${newStatus === 'active' ? 'activated' : 'suspended'}`, 'success');
      loadTenants();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  };

  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-green-500';
  const labelClass = 'block text-xs font-semibold text-gray-600 mb-1';

  return (
    <div data-testid="super-tenants-panel">
      {!isSuperAdmin ? (
        <div className="text-center py-16">
          <h2 className="text-2xl font-bold text-gray-700 mb-2">Access Denied</h2>
          <p className="text-gray-500 text-sm">Super Admin access required.</p>
        </div>
      ) : loading ? (
        <LoadingSpinner text="Loading tenants..." />
      ) : drillTenant ? (
        <TenantDrilldown key={drillTenant.id} tenant={drillTenant} onBack={() => setDrillTenant(null)} />
      ) : (
      <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">Tenant Directory</h2>
        <span className="text-sm text-gray-500">{tenants.length} tenant{tenants.length !== 1 ? 's' : ''}</span>
      </div>

      <div data-testid="tenants-table" className="space-y-4">
        {tenants.map((tenant) => (
          <div key={tenant.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-800">{tenant.name}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {tenant.customDomain
                    ? tenant.customDomain
                    : tenant.subdomain
                      ? `${tenant.subdomain}.sinaicamps.com`
                      : 'No subdomain'}
                  {tenant.location ? ` · ${tenant.location}` : ''}
                </p>
                <div className="flex gap-3 mt-2 text-xs">
                  <span
                    data-testid="tenant-type-badge"
                    className="px-2 py-0.5 rounded-full font-semibold bg-purple-100 text-purple-700"
                  >
                    {typeLabel(tenant.type)}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full font-semibold ${tenant.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {tenant.status}
                  </span>
                  {tenant.currency && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      {tenant.currency}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setDrillTenant(tenant)}
                  data-testid="manage-tenant-btn"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer bg-purple-600 text-white hover:bg-purple-700"
                >
                  Manage
                </button>
                <button
                  onClick={() => toggleStatus(tenant.id, tenant.status)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer ${
                    tenant.status === 'active'
                      ? 'bg-red-50 text-red-600 hover:bg-red-100'
                      : 'bg-green-50 text-green-600 hover:bg-green-100'
                  }`}
                >
                  {tenant.status === 'active' ? 'Suspend' : 'Activate'}
                </button>
                <button
                  onClick={() => editingId === tenant.id ? cancelEdit() : startEdit(tenant)}
                  data-testid="edit-tenant-btn"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer ${
                    editingId === tenant.id
                      ? 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                      : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                  }`}
                >
                  {editingId === tenant.id ? 'Cancel' : 'Edit Admin'}
                </button>
              </div>
            </div>

            {editingId === tenant.id && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h4 className="text-sm font-bold text-gray-700 mb-3">Admin Account for "{tenant.name}"</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="edit-admin-email" className={labelClass}>Admin Email</label>
                    <input
                      id="edit-admin-email"
                      type="email"
                      value={form.adminEmail}
                      onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                      className={inputClass}
                      placeholder="admin@camp.com"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-admin-password" className={labelClass}>Admin Password</label>
                    <input
                      id="edit-admin-password"
                      type="password"
                      value={form.adminPassword}
                      onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                      className={inputClass}
                      placeholder="Leave blank to keep current"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-admin-firstname" className={labelClass}>First Name</label>
                    <input
                      id="edit-admin-firstname"
                      type="text"
                      value={form.adminFirstName}
                      onChange={(e) => setForm({ ...form, adminFirstName: e.target.value })}
                      className={inputClass}
                      placeholder="Camp"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-admin-lastname" className={labelClass}>Last Name</label>
                    <input
                      id="edit-admin-lastname"
                      type="text"
                      value={form.adminLastName}
                      onChange={(e) => setForm({ ...form, adminLastName: e.target.value })}
                      className={inputClass}
                      placeholder="Admin"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-tenant-type" className={labelClass}>Tenant Type</label>
                    <select
                      id="edit-tenant-type"
                      data-testid="edit-tenant-type"
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value })}
                      className={inputClass}
                    >
                      {TENANT_TYPE_VALUES.map((value) => (
                        <option key={value} value={value}>
                          {TENANT_TYPE_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => saveTenant(tenant.id)}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 border-none cursor-pointer"
                  >
                    {saving ? 'Saving...' : 'Save Admin'}
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 border-none cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {tenants.length === 0 && (
          <div className="text-center py-12 text-gray-500 text-sm">No tenants found.</div>
        )}
      </div>

      {/* Admin Users Management */}
      <div className="mt-8">
        <button
          onClick={() => setShowAdmins(!showAdmins)}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 border-none cursor-pointer"
        >
          {showAdmins ? 'Hide' : 'Show'} Admin Users ({admins.length})
        </button>

        {showAdmins && (
          <div className="mt-4 space-y-3">
            {admins.map((a) => (
              <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs flex items-center justify-between">
                <div>
                   <p className="text-sm font-bold text-gray-800">{a.firstName} {a.lastName}</p>
                   <p className="text-xs text-gray-500">{a.email} · {a.role} · Tenant: {a.tenantId || 'global'}</p>
                </div>
                <div className="flex items-center gap-3">
                 <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${a.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                     {a.isActive ? 'Active' : 'Inactive'}
                   </span>
                  {a.role !== 'super_admin' && (
                    <button
                       onClick={() => toggleAdminActive(a.id, a.isActive)}
                       className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer ${
                         a.isActive
                           ? 'bg-red-50 text-red-600 hover:bg-red-100'
                           : 'bg-green-50 text-green-600 hover:bg-green-100'
                       }`}
                     >
                       {a.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {admins.length === 0 && (
              <div className="text-center py-8 text-gray-500 text-sm">No admin users found.</div>
            )}
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
