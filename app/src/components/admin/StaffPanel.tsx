import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { components } from '@/lib/api-types';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { DataTable } from '@/components/ui/DataTable';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StatusTag } from '@/components/ui/StatusTag';
import { formatDate } from '@/lib/utils';
import { IconStaff } from './icons';

type Schemas = components['schemas'];
type PosUser = Schemas['PosUser'];
type PosRole = 'cashier' | 'manager' | 'admin';

const PAGE_SIZE = 10;

interface TenantRecord {
  id: string;
  name: string;
  subdomain: string;
  status: string;
  [key: string]: unknown;
}

interface StaffForm {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  password: string;
  role: PosRole;
  phone: string;
  department: string;
  employeeId: string;
  isActive: string; // '1' | '0' (Select-friendly)
}

const emptyForm: StaffForm = {
  firstName: '',
  lastName: '',
  email: '',
  username: '',
  password: '',
  role: 'cashier',
  phone: '',
  department: '',
  employeeId: '',
  isActive: '1',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Role pill — color-coded per POS role (heroicons-free, plain span). */
function RoleBadge({ role, label }: { role: string; label: string }) {
  const palette: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    manager: 'bg-blue-100 text-blue-700',
    cashier: 'bg-emerald-100 text-emerald-700',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${palette[role] ?? 'bg-warm-100 text-warm-700'}`}
    >
      {label}
    </span>
  );
}

const plusIcon = (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const editIcon = (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const keyIcon = (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
  </svg>
);

const trashIcon = (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

/**
 * Admin Staff panel — POS user management (CRUD + reset password).
 *
 * Super admins get a tenant selector (scoped via `getAdminTenants` +
 * `getPosUsers({ tenantId })`); tenant admins are hard-scoped server-side and
 * call `getPosUsers()` without a tenantId.
 *
 * When `scopedTenantId` is provided (e.g. from TenantDrilldown), the tenant
 * selector is hidden and the panel operates directly on that tenant.
 *
 * All user-provided values are rendered through React JSX, which escapes text
 * by default — the project-safe pattern for components (escHtml() is only for
 * raw HTML string contexts such as Astro templates).
 */
export default function StaffPanel({ scopedTenantId }: { scopedTenantId?: string }) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const isSuperAdmin = user?.role === 'super_admin';

  // ─── Data ───────────────────────────────────────────────────────────
  const [users, setUsers] = useState<PosUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Super-admin tenant selector
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState('');

  // Create/edit modal
  const [showForm, setShowForm] = useState(false);
  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [form, setForm] = useState<StaffForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Reset-password modal
  const [showReset, setShowReset] = useState(false);
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<PosUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadTenants = useCallback(async () => {
    setLoadingTenants(true);
    try {
      const data = await api.getAdminTenants();
      const list = Array.isArray(data)
        ? data
        : Array.isArray((data as { data?: unknown })?.data)
          ? ((data as { data: TenantRecord[] }).data)
          : [];
      setTenants(list);
      setSelectedTenantId((prev) => prev || (list.length > 0 ? list[0].id : ''));
    } catch (err) {
      showToast('Failed to load tenants: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setLoadingTenants(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (isSuperAdmin && !scopedTenantId) loadTenants();
  }, [isSuperAdmin, scopedTenantId, loadTenants]);

  // When scopedTenantId is provided, use it directly as the selected tenant
  useEffect(() => {
    if (scopedTenantId) setSelectedTenantId(scopedTenantId);
  }, [scopedTenantId]);

  const loadUsers = useCallback(
    async (targetPage: number, query: string) => {
      setLoading(true);
      setError(null);
      try {
        const params: { page?: number; pageSize?: number; search?: string; tenantId?: string } = {
          page: targetPage,
          pageSize: PAGE_SIZE,
        };
        if (query) params.search = query;
        if (isSuperAdmin) params.tenantId = scopedTenantId || selectedTenantId;

        const res = await api.getPosUsers(params);
        setUsers(res.data ?? []);
        setTotal(res.total ?? 0);
        setPage(res.page ?? targetPage);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        showToast('Failed to load staff: ' + msg, 'error');
      } finally {
        setLoading(false);
      }
    },
    [isSuperAdmin, scopedTenantId, selectedTenantId, showToast],
  );

  useEffect(() => {
    if (isSuperAdmin && !selectedTenantId) return;
    loadUsers(1, search);
  }, [isSuperAdmin, selectedTenantId, search, loadUsers]);

  const roleOptions = [
    { value: 'cashier', label: 'Cashier' },
    { value: 'manager', label: 'Manager' },
    { value: 'admin', label: 'Admin' },
  ];

  const statusOptions = [
    { value: '1', label: 'Active' },
    { value: '0', label: 'Inactive' },
  ];

  const roleLabels: Record<string, string> = {
    cashier: 'Cashier',
    manager: 'Manager',
    admin: 'Admin',
  };

  const tenantOptions = useMemo(
    () => tenants.map((tn) => ({ value: tn.id, label: `${tn.name} (${tn.status})` })),
    [tenants],
  );

  const columns = useMemo(
    () => [
      {
        key: 'firstName',
        header: 'Name',
        sortable: true,
        render: (u: PosUser & Record<string, unknown>) => (
          <strong className="text-gray-800">
            {String(u.firstName || '')} {String(u.lastName || '')}
          </strong>
        ),
      },
      {
        key: 'email',
        header: 'Email',
        sortable: true,
        render: (u: PosUser & Record<string, unknown>) => (
          <span className="text-gray-600">{String(u.email || '—')}</span>
        ),
      },
      {
        key: 'username',
        header: 'Username',
        render: (u: PosUser & Record<string, unknown>) => (
          <span className="text-gray-600">{String(u.username || u.email || '—')}</span>
        ),
      },
      {
        key: 'role',
        header: 'Role',
        render: (u: PosUser & Record<string, unknown>) => (
          <RoleBadge role={String(u.role || 'cashier')} label={roleLabels[String(u.role)] ?? String(u.role)} />
        ),
      },
      {
        key: 'department',
        header: 'Department',
        render: (u: PosUser & Record<string, unknown>) => (
          <span className="text-gray-600">{String(u.department || '—')}</span>
        ),
      },
      {
        key: 'isActive',
        header: 'Status',
        render: (u: PosUser & Record<string, unknown>) => (
          <StatusTag status={u.isActive ? 'active' : 'inactive'} />
        ),
      },
      {
        key: 'lastLogin',
        header: 'Last Login',
        sortable: true,
        render: (u: PosUser & Record<string, unknown>) => (
          <span className="text-gray-500">{u.lastLogin ? formatDate(String(u.lastLogin)) : '—'}</span>
        ),
      },
    ],
    [roleLabels],
  );

  // ─── Modal handlers ─────────────────────────────────────────────────
  const openAdd = useCallback(() => {
    setEditUserId(null);
    setForm(emptyForm);
    setShowForm(true);
  }, []);

  const openEdit = useCallback((u: PosUser) => {
    setEditUserId(u.id);
    setForm({
      firstName: u.firstName || '',
      lastName: u.lastName || '',
      email: u.email || '',
      username: u.username || '',
      password: '',
      role: (['cashier', 'manager', 'admin'].includes(u.role) ? u.role : 'cashier') as PosRole,
      phone: u.phone || '',
      department: u.department || '',
      employeeId: u.employeeId || '',
      isActive: u.isActive ? '1' : '0',
    });
    setShowForm(true);
  }, []);

  const openReset = useCallback((u: PosUser) => {
    setResetUserId(u.id);
    setResetPassword('');
    setShowReset(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      showToast('This field is required', 'warning');
      return;
    }
    if (!form.email.trim()) {
      showToast('This field is required', 'warning');
      return;
    }
    if (!EMAIL_RE.test(form.email.trim())) {
      showToast('Please enter a valid email', 'warning');
      return;
    }
    if (editUserId == null && form.password.length < 8) {
      showToast('Password must be at least 8 characters', 'warning');
      return;
    }
    setSaving(true);
    try {
      if (editUserId != null) {
        await api.updatePosUser(editUserId, {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          username: form.username.trim() || undefined,
          phone: form.phone.trim() || undefined,
          role: form.role,
          isActive: form.isActive === '1',
          department: form.department.trim() || undefined,
          employeeId: form.employeeId.trim() || undefined,
        });
        showToast('Staff user updated successfully', 'success');
      } else {
        await api.createPosUser({
          email: form.email.trim(),
          username: form.username.trim() || undefined,
          password: form.password,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone.trim() || undefined,
          role: form.role,
          department: form.department.trim() || undefined,
          employeeId: form.employeeId.trim() || undefined,
        });
        showToast('Staff user created successfully', 'success');
      }
      setShowForm(false);
      setEditUserId(null);
      setForm(emptyForm);
      loadUsers(editUserId != null ? page : 1, search);
    } catch (err) {
      showToast('Error saving staff user: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setSaving(false);
    }
  }, [form, editUserId, page, search, loadUsers, showToast]);

  const handleResetPassword = useCallback(async () => {
    if (resetUserId == null) return;
    if (resetPassword.length < 8) {
      showToast('Password must be at least 8 characters', 'warning');
      return;
    }
    setResetting(true);
    try {
      await api.resetPosUserPassword(resetUserId, resetPassword);
      showToast('Password reset successfully', 'success');
      setShowReset(false);
      setResetUserId(null);
      setResetPassword('');
    } catch (err) {
      showToast('Error resetting password: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setResetting(false);
    }
  }, [resetUserId, resetPassword, showToast]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await api.deletePosUser(deleteTarget.id);
      showToast('Staff user deleted successfully', 'success');
      // If the deleted row was the only one on this page, step back a page.
      const nextPage = users.length === 1 && page > 1 ? page - 1 : page;
      setDeleteTarget(null);
      loadUsers(nextPage, search);
    } catch (err) {
      showToast('Error deleting staff user: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, deleting, users.length, page, search, loadUsers, showToast]);

  return (
    <Card padding="none" className="p-6" data-testid="staff-panel" aria-busy={loading || loadingTenants || undefined}>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <span className="text-brand-600"><IconStaff size={20} /></span>
          Staff
        </h2>
        <Button
          variant="success"
          size="md"
          onClick={openAdd}
          data-testid="add-user-btn"
          leftIcon={plusIcon}
        >
          Add Staff User
        </Button>
      </div>

      {isSuperAdmin && !scopedTenantId && (
        <Card padding="md" className="mb-6" data-testid="tenant-filter">
          <div className="min-w-[220px] max-w-md">
            <Select
              label="Select Tenant"
              options={tenantOptions}
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
              placeholder="Select Tenant"
              disabled={loadingTenants}
            />
          </div>
        </Card>
      )}

      {loading ? (
        <LoadingSpinner text="Staff" />
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-500 text-sm mb-3">{error}</p>
          <Button variant="success" size="md" onClick={() => loadUsers(page, search)}>
            Retry
          </Button>
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          title="No staff users found"
          description="Add your first staff user to start managing your team."
          action={{ label: 'Add Staff User', onClick: openAdd }}
        />
      ) : (
        <DataTable<PosUser & Record<string, unknown>>
          columns={columns}
          data={users as (PosUser & Record<string, unknown>)[]}
          rowKey="id"
          size="md"
          searchable
          searchPlaceholder="Search staff…"
          onSearch={setSearch}
          emptyMessage="No staff users found"
          pagination={{
            page,
            total,
            pageSize: PAGE_SIZE,
            onChange: (p) => loadUsers(p, search),
          }}
          actions={(u) => (
            <div className="flex gap-1.5" aria-label="Actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openEdit(u as unknown as PosUser)}
                leftIcon={editIcon}
              >
                Edit
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openReset(u as unknown as PosUser)}
                leftIcon={keyIcon}
              >
                Reset Password
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setDeleteTarget(u as unknown as PosUser)}
                leftIcon={trashIcon}
              >
                Delete
              </Button>
            </div>
          )}
        />
      )}

      <FormModal
        open={showForm}
        title={editUserId != null ? 'Edit Staff User' : 'Add Staff User'}
        onClose={() => { setShowForm(false); setEditUserId(null); }}
        onSubmit={handleSave}
        submitLabel={saving ? 'Saving...' : 'Save'}
        submitDisabled={saving}
        loading={saving}
        size="lg"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="First Name *"
            type="text"
            value={form.firstName}
            onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
            placeholder="First Name"
          />
          <Input
            label="Last Name *"
            type="text"
            value={form.lastName}
            onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
            placeholder="Last Name"
          />
          <Input
            label="Email *"
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="name@camp.com"
          />
          <Input
            label="Username"
            type="text"
            value={form.username}
            onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
            placeholder="Username"
          />
          {editUserId == null && (
            <Input
              label="Password *"
              type="password"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="••••••••"
            />
          )}
          <Select
            label="Role *"
            options={roleOptions}
            value={form.role}
            onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as PosRole }))}
            placeholder="Role"
          />
          <Input
            label="Phone"
            type="tel"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            placeholder="+20 ..."
          />
          <Input
            label="Department"
            type="text"
            value={form.department}
            onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))}
            placeholder="Department"
          />
          <Input
            label="Employee ID"
            type="text"
            value={form.employeeId}
            onChange={(e) => setForm((prev) => ({ ...prev, employeeId: e.target.value }))}
            placeholder="Employee ID"
          />
          {editUserId != null && (
            <Select
              label="Status"
              options={statusOptions}
              value={form.isActive}
              onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.value }))}
            />
          )}
        </div>
      </FormModal>

      <FormModal
        open={showReset}
        title="Reset Password"
        onClose={() => { setShowReset(false); setResetUserId(null); setResetPassword(''); }}
        onSubmit={handleResetPassword}
        submitLabel={resetting ? 'Saving...' : 'Reset Password'}
        submitDisabled={resetting}
        loading={resetting}
        size="sm"
      >
        <Input
          label="Password *"
          type="password"
          value={resetPassword}
          onChange={(e) => setResetPassword(e.target.value)}
          placeholder="••••••••"
        />
      </FormModal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete"
        message={`Are you sure you want to delete ${deleteTarget ? `${deleteTarget.firstName} ${deleteTarget.lastName}` : ''}? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Card>
  );
}
