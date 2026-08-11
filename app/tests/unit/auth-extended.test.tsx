import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/lib/auth';

vi.mock('@/lib/api', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  getAuthMe: vi.fn(),
  getTenantId: vi.fn().mockReturnValue('marketplace'),
  setTenantScope: vi.fn(),
  REFRESH_TOKEN_KEY: 'sinaicamps_refresh_token',
}));

import { login as apiLogin, logout as apiLogout, getAuthMe } from '@/lib/api';

function AuthConsumer() {
  const { user, loading, isAuthenticated, login, logout, hasRole } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="isAuthenticated">{String(isAuthenticated)}</span>
      <span data-testid="user-role">{user?.role ?? 'none'}</span>
      <span data-testid="hasRole-admin">{String(hasRole('admin'))}</span>
      <span data-testid="hasRole-super_admin">{String(hasRole('super_admin'))}</span>
      <button
        onClick={() => login('a@b.com', 'pass')}
        data-testid="login-btn"
      >
        Login
      </button>
      <button onClick={() => logout()} data-testid="logout-btn">
        Logout
      </button>
    </div>
  );
}

describe('AuthProvider extended', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('login stores token in localStorage and renders protected content', async () => {
    vi.mocked(apiLogin).mockResolvedValue({
      token: 'test-token',
      user: { role: 'admin', email: 'a@b.com' },
    } as never);
    vi.mocked(getAuthMe).mockRejectedValue(new Error('no token'));

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('login-btn'));
    });

    expect(localStorage.getItem('sinaicamps_token')).toBe('test-token');
    expect(screen.getByTestId('isAuthenticated').textContent).toBe('true');
    expect(screen.getByTestId('user-role').textContent).toBe('admin');
  });

  it('logout clears token from localStorage', async () => {
    localStorage.setItem('sinaicamps_token', 'existing-token');
    localStorage.setItem('sinaicamps_user', JSON.stringify({ role: 'admin', email: 'a@b.com' }));
    vi.mocked(apiLogout).mockResolvedValue(undefined as never);
    vi.mocked(getAuthMe).mockResolvedValue({ user: { role: 'admin', email: 'a@b.com' } } as never);

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('logout-btn'));
    });

    expect(localStorage.getItem('sinaicamps_token')).toBeNull();
    expect(localStorage.getItem('sinaicamps_user')).toBeNull();
  });

  it('role-based rendering: hasRole returns correct boolean', async () => {
    vi.mocked(getAuthMe).mockResolvedValue({ user: { role: 'super_admin', email: 'a@b.com' } } as never);
    localStorage.setItem('sinaicamps_token', 'valid-token');

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('hasRole-admin').textContent).toBe('true');
    expect(screen.getByTestId('hasRole-super_admin').textContent).toBe('true');
  });

  it('expired token triggers cleanup and sets user to null', async () => {
    localStorage.setItem('sinaicamps_token', 'expired-token');
    vi.mocked(getAuthMe).mockRejectedValue(new Error('Unauthorized'));

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('user-role').textContent).toBe('none');
    expect(screen.getByTestId('isAuthenticated').textContent).toBe('false');
    expect(localStorage.getItem('sinaicamps_token')).toBeNull();
  });

  it('useAuth throws when used outside AuthProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<AuthConsumer />);
    }).toThrow('useAuth must be used within an AuthProvider');

    consoleSpy.mockRestore();
  });
});
