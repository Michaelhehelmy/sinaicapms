import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UsersPanel from '@/components/admin/UsersPanel';

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { role: 'super_admin' } }),
}));

const users = [
  {
    id: 'u1',
    email: 'admin@camp.com',
    displayName: 'Camp Admin',
    role: 'admin',
    tenantId: 't1',
    tenantName: 'Acacia',
    lastLogin: null,
    createdAt: '2026-01-01T00:00:00Z',
  },
];

vi.mock('@/hooks/useQueryHooks', () => ({
  useAdminUsersQuery: () => ({ data: users, isLoading: false }),
  queryKeys: { admins: ['admin', 'users'] },
}));

vi.mock('@/lib/api', () => ({
  updateAdminUser: vi.fn(),
  deleteAdminUser: vi.fn(),
}));

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UsersPanel />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UsersPanel edit-role dialog a11y (F-A19-09)', () => {
  it('renders the dialog with role, aria-modal, and labelledby', async () => {
    renderPanel();
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit Role' })[0]);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId!)).toHaveTextContent('Edit Role');
  });

  it('labels the role select and moves initial focus to it', async () => {
    renderPanel();
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit Role' })[0]);

    const select = screen.getByLabelText('Role');
    expect(select.tagName).toBe('SELECT');
    expect(select).toHaveFocus();
  });

  it('closes on Escape', async () => {
    renderPanel();
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit Role' })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('UsersPanel filter labels', () => {
  it('labels the search input and role filter', () => {
    renderPanel();
    expect(screen.getByLabelText('Search users')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by role')).toBeInTheDocument();
  });
});
