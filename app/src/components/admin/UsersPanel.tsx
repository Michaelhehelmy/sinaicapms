import React, { useState, useCallback, useMemo } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { DataTable } from '@/components/ui/DataTable';
import { StatusTag } from '@/components/ui/StatusTag';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/lib/auth';
import { useAdminUsersQuery } from '@/hooks/useQueryHooks';
import { updateAdminUser, deleteAdminUser } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  tenantId: string | null;
  tenantName: string | null;
  lastLogin: string | null;
  createdAt: string;
}

const roleColors: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  viewer: 'bg-gray-100 text-gray-600',
};

export default function UsersPanel() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editRole, setEditRole] = useState('');
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);

  const isSuperAdmin = user?.role === 'super_admin';

  const { data: usersData, isLoading } = useAdminUsersQuery();

  const users: AdminUser[] = useMemo(() => {
    if (!usersData) return [];
    // Handle both paginated and array response
    const raw = (usersData as { data?: AdminUser[] })?.data || usersData;
    return Array.isArray(raw) ? raw : [];
  }, [usersData]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        if (!u.email.toLowerCase().includes(q) && !u.displayName.toLowerCase().includes(q) && !u.tenantName?.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      return true;
    });
  }, [users, searchTerm, roleFilter]);

  const handleEditRole = async () => {
    if (!editingUser || !editRole) return;
    try {
      await updateAdminUser(editingUser.id, { role: editRole });
      showToast(`Updated ${editingUser.displayName || editingUser.email} role to ${editRole}`, 'success');
      setEditingUser(null);
    } catch (err) {
      showToast('Failed to update user: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  };

  const handleDeactivate = async () => {
    if (!deletingUser) return;
    try {
      await deleteAdminUser(deletingUser.id);
      showToast(`Deactivated ${deletingUser.displayName || deletingUser.email}`, 'success');
      setDeletingUser(null);
    } catch (err) {
      showToast('Failed to deactivate user: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  };

  const exportCSV = useCallback(() => {
    const headers = ['Email', 'Name', 'Role', 'Tenant', 'Last Login', 'Created'];
    const rows = filteredUsers.map((u) => [
      u.email,
      u.displayName,
      u.role,
      u.tenantName || 'Global',
      u.lastLogin ? formatDate(u.lastLogin) : 'Never',
      formatDate(u.createdAt),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${filteredUsers.length} users to CSV`, 'success');
  }, [filteredUsers, showToast]);

  const columns = [
    {
      key: 'email',
      header: 'Email',
      sortable: true,
      render: (u: AdminUser) => (
        <span className="font-medium text-gray-800">{u.email}</span>
      ),
    },
    {
      key: 'displayName',
      header: 'Name',
      sortable: true,
      render: (u: AdminUser) => (
        <span className="text-gray-700">{u.displayName || '—'}</span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (u: AdminUser) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${roleColors[u.role] || 'bg-gray-100 text-gray-600'}`}>
          {u.role}
        </span>
      ),
    },
    {
      key: 'tenantName',
      header: 'Tenant',
      render: (u: AdminUser) => (
        <span className="text-gray-600">{u.tenantName || 'Global'}</span>
      ),
    },
    {
      key: 'lastLogin',
      header: 'Last Login',
      render: (u: AdminUser) => (
        <span className="text-gray-500 text-xs">{u.lastLogin ? formatDate(u.lastLogin) : 'Never'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      render: (u: AdminUser) => (
        <span className="text-gray-500 text-xs">{formatDate(u.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (u: AdminUser) => (
        u.role === 'super_admin' ? (
          <span className="text-xs text-gray-400">Protected</span>
        ) : (
          <div className="flex gap-1.5">
            <button
              onClick={() => { setEditingUser(u); setEditRole(u.role); }}
              className="px-2 py-1 rounded text-[10px] font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100 cursor-pointer"
            >
              Edit Role
            </button>
            <button
              onClick={() => setDeletingUser(u)}
              className="px-2 py-1 rounded text-[10px] font-semibold bg-red-50 text-red-600 hover:bg-red-100 cursor-pointer"
            >
              Deactivate
            </button>
          </div>
        )
      ),
    },
  ];

  return (
    <div data-testid="users-panel">
      {!isSuperAdmin ? (
        <div className="text-center py-16">
          <h2 className="text-2xl font-bold text-gray-700 mb-2">Access Denied</h2>
          <p className="text-gray-500 text-sm">Super Admin access required.</p>
        </div>
      ) : isLoading ? (
        <div className="py-16">
          <LoadingSpinner text="Loading admin users..." />
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Admin Users</h2>
              <p className="text-xs text-gray-500 mt-0.5">Manage admin accounts across all tenants</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{filteredUsers.length} of {users.length} user{users.length !== 1 ? 's' : ''}</span>
              <button
                onClick={exportCSV}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Export CSV
                </span>
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
            <div className="relative flex-1 min-w-[200px]">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by email, name, or tenant..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-green-500 bg-white"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-green-500"
            >
              <option value="all">All Roles</option>
              <option value="super_admin">Super Admin</option>
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
            </select>
            {(searchTerm || roleFilter !== 'all') && (
              <button
                onClick={() => { setSearchTerm(''); setRoleFilter('all'); }}
                className="px-3 py-2 rounded-lg text-xs font-semibold text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Users Table */}
          <DataTable
            columns={columns}
            data={filteredUsers}
            rowKey="id"
            searchable={false}
          />

          {/* Edit Role Dialog */}
          {editingUser && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg">
                <h3 className="text-sm font-bold text-gray-800 mb-4">Edit Role</h3>
                <p className="text-xs text-gray-500 mb-3">
                  Change role for <strong>{editingUser.displayName || editingUser.email}</strong>
                </p>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm mb-4 focus:outline-none focus:border-green-500"
                >
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={handleEditRole}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 border-none cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingUser(null)}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 border-none cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          <ConfirmDialog
            open={!!deletingUser}
            title="Deactivate User"
            message={`Are you sure you want to deactivate "${deletingUser?.displayName || deletingUser?.email}"? They will no longer be able to log in.`}
            confirmLabel="Deactivate"
            cancelLabel="Cancel"
            onConfirm={handleDeactivate}
            onCancel={() => setDeletingUser(null)}
            danger
          />
        </>
      )}
    </div>
  );
}
