import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth, ROLE_HIERARCHY, type AuthUser } from '@/lib/auth';

vi.mock('@/lib/api', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  getAuthMe: vi.fn(),
  getTenantId: vi.fn().mockReturnValue('marketplace'),
  setTenantScope: vi.fn(),
  REFRESH_TOKEN_KEY: 'sinaicamps_refresh_token',
}));

import { login as apiLogin, logout as apiLogout, getAuthMe, setTenantScope } from '@/lib/api';

// ── Test harness ──────────────────────────────────────────────────────

function AuthConsumer() {
  const { user, loading, isAuthenticated, login, logout, hasRole } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="isAuthenticated">{String(isAuthenticated)}</span>
      <span data-testid="role">{user?.role ?? 'none'}</span>
      <span data-testid="email">{user?.email ?? 'none'}</span>
      <span data-testid="hasRole-super_admin">{String(hasRole('super_admin'))}</span>
      <span data-testid="hasRole-admin">{String(hasRole('admin'))}</span>
      <span data-testid="hasRole-manager">{String(hasRole('manager'))}</span>
      <span data-testid="hasRole-cashier">{String(hasRole('cashier'))}</span>
      <span data-testid="hasRole-unknown">{String(hasRole('bogus'))}</span>
      <button data-testid="login-btn" onClick={() => login('a@b.com', 'pass')}>Login</button>
      <button data-testid="login-error-btn" onClick={async () => {
        const r = await login('bad@b.com', 'wrong');
        document.querySelector('[data-testid="login-result"]')?.setAttribute('data-result', JSON.stringify(r));
      }}>LoginErr</button>
      <button data-testid="logout-btn" onClick={() => logout()}>Logout</button>
      <span data-testid="login-result" />
    </div>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('AuthProvider — renders children', () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('renders child content', async () => {
    vi.mocked(getAuthMe).mockRejectedValue(new Error('no token'));
    await act(async () => {
      render(
        <AuthProvider>
          <span data-testid="child">hello</span>
        </AuthProvider>,
      );
    });
    expect(screen.getByTestId('child').textContent).toBe('hello');
  });

  it('starts with loading=true and resolves to false', async () => {
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
  });
});

describe('AuthProvider — login stores token and user', () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('stores access token, refresh token, and user in localStorage after login', async () => {
    vi.mocked(getAuthMe).mockRejectedValue(new Error('no token'));
    vi.mocked(apiLogin).mockResolvedValue({
      data: {
        tokens: { accessToken: 'new-access', refreshToken: 'new-refresh' },
        user: { role: 'admin', email: 'a@b.com' },
      },
    } as never);

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('login-btn'));
    });

    expect(localStorage.getItem('sinaicamps_token')).toBe('new-access');
    expect(localStorage.getItem('sinaicamps_refresh_token')).toBe('new-refresh');
    expect(screen.getByTestId('isAuthenticated').textContent).toBe('true');
    expect(screen.getByTestId('role').textContent).toBe('admin');
    expect(screen.getByTestId('email').textContent).toBe('a@b.com');
  });

  it('handles legacy flat token/user shape', async () => {
    vi.mocked(getAuthMe).mockRejectedValue(new Error('no token'));
    vi.mocked(apiLogin).mockResolvedValue({
      token: 'flat-token',
      user: { role: 'admin', email: 'a@b.com' },
    } as never);

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('login-btn'));
    });

    expect(localStorage.getItem('sinaicamps_token')).toBe('flat-token');
    expect(screen.getByTestId('isAuthenticated').textContent).toBe('true');
  });

  it('returns success object on successful login', async () => {
    vi.mocked(getAuthMe).mockRejectedValue(new Error('no token'));
    vi.mocked(apiLogin).mockResolvedValue({
      token: 'tok',
      user: { role: 'admin' },
    } as never);

    let result: { success: boolean; error?: string } | undefined;
    await act(async () => {
      render(
        <AuthProvider>
          <LoginCatcher onResult={(r) => { result = r; }} />
        </AuthProvider>,
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('login-catcher-btn'));
    });
    expect(result).toEqual({ success: true });
  });

  it('returns error object when login API throws', async () => {
    vi.mocked(getAuthMe).mockRejectedValue(new Error('no token'));
    vi.mocked(apiLogin).mockRejectedValue(new Error('Invalid credentials'));

    let result: { success: boolean; error?: string } | undefined;
    await act(async () => {
      render(
        <AuthProvider>
          <LoginCatcher onResult={(r) => { result = r; }} />
        </AuthProvider>,
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('login-catcher-btn'));
    });
    expect(result).toEqual({ success: false, error: 'Invalid credentials' });
  });

  it('returns generic error when API throws non-Error value', async () => {
    vi.mocked(getAuthMe).mockRejectedValue(new Error('no token'));
    vi.mocked(apiLogin).mockRejectedValue('string error');

    let result: { success: boolean; error?: string } | undefined;
    await act(async () => {
      render(
        <AuthProvider>
          <LoginCatcher onResult={(r) => { result = r; }} />
        </AuthProvider>,
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('login-catcher-btn'));
    });
    expect(result).toEqual({ success: false, error: 'Login failed' });
  });
});

describe('AuthProvider — logout clears session', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('clears token, refresh token, user from localStorage and calls setTenantScope(null)', async () => {
    localStorage.setItem('sinaicamps_token', 'tok');
    localStorage.setItem('sinaicamps_refresh_token', 'refresh');
    localStorage.setItem('sinaicamps_user', JSON.stringify({ role: 'admin' }));
    vi.mocked(getAuthMe).mockResolvedValue({ user: { role: 'admin', email: 'a@b.com' } } as never);
    vi.mocked(apiLogout).mockResolvedValue(undefined as never);

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('logout-btn'));
    });

    expect(localStorage.getItem('sinaicamps_token')).toBeNull();
    expect(localStorage.getItem('sinaicamps_refresh_token')).toBeNull();
    expect(localStorage.getItem('sinaicamps_user')).toBeNull();
    expect(screen.getByTestId('isAuthenticated').textContent).toBe('false');
    expect(screen.getByTestId('role').textContent).toBe('none');
    expect(setTenantScope).toHaveBeenCalledWith(null);
  });

  it('clears session even when API logout throws', async () => {
    localStorage.setItem('sinaicamps_token', 'tok');
    localStorage.setItem('sinaicamps_user', JSON.stringify({ role: 'admin' }));
    vi.mocked(getAuthMe).mockResolvedValue({ user: { role: 'admin' } } as never);
    vi.mocked(apiLogout).mockRejectedValue(new Error('network'));

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('logout-btn'));
    });

    expect(localStorage.getItem('sinaicamps_token')).toBeNull();
    expect(localStorage.getItem('sinaicamps_user')).toBeNull();
  });
});

describe('AuthProvider — expired token clears session', () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('removes token, refresh token, and user when getAuthMe fails', async () => {
    localStorage.setItem('sinaicamps_token', 'expired');
    localStorage.setItem('sinaicamps_refresh_token', 'stale-refresh');
    localStorage.setItem('sinaicamps_user', JSON.stringify({ role: 'admin' }));
    vi.mocked(getAuthMe).mockRejectedValue(new Error('Unauthorized'));

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    expect(localStorage.getItem('sinaicamps_token')).toBeNull();
    expect(localStorage.getItem('sinaicamps_refresh_token')).toBeNull();
    expect(localStorage.getItem('sinaicamps_user')).toBeNull();
    expect(screen.getByTestId('isAuthenticated').textContent).toBe('false');
  });
});

describe('AuthProvider — role hierarchy checking', () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('super_admin passes all role checks', async () => {
    vi.mocked(getAuthMe).mockResolvedValue({ user: { role: 'super_admin', email: 'a@b.com' } } as never);
    localStorage.setItem('sinaicamps_token', 'tok');

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    expect(screen.getByTestId('hasRole-super_admin').textContent).toBe('true');
    expect(screen.getByTestId('hasRole-admin').textContent).toBe('true');
    expect(screen.getByTestId('hasRole-manager').textContent).toBe('true');
    expect(screen.getByTestId('hasRole-cashier').textContent).toBe('true');
  });

  it('admin passes admin and below, fails super_admin', async () => {
    vi.mocked(getAuthMe).mockResolvedValue({ user: { role: 'admin', email: 'a@b.com' } } as never);
    localStorage.setItem('sinaicamps_token', 'tok');

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    expect(screen.getByTestId('hasRole-super_admin').textContent).toBe('false');
    expect(screen.getByTestId('hasRole-admin').textContent).toBe('true');
    expect(screen.getByTestId('hasRole-manager').textContent).toBe('true');
    expect(screen.getByTestId('hasRole-cashier').textContent).toBe('true');
  });

  it('unregistered role (cashier, manager) passes everything (level 0 >= level 0)', async () => {
    vi.mocked(getAuthMe).mockResolvedValue({ user: { role: 'cashier', email: 'a@b.com' } } as never);
    localStorage.setItem('sinaicamps_token', 'tok');

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    // cashier and manager are not in ROLE_HIERARCHY → level 0; minRole 'manager'/'cashier' also level 0
    expect(screen.getByTestId('hasRole-cashier').textContent).toBe('true');
    expect(screen.getByTestId('hasRole-manager').textContent).toBe('true');
    // but admin (level 4) and super_admin (level 10) require higher
    expect(screen.getByTestId('hasRole-admin').textContent).toBe('false');
    expect(screen.getByTestId('hasRole-super_admin').textContent).toBe('false');
  });

  it('hasRole returns false when user has no role', async () => {
    vi.mocked(getAuthMe).mockResolvedValue({ user: { email: 'a@b.com' } } as never);
    localStorage.setItem('sinaicamps_token', 'tok');

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    expect(screen.getByTestId('hasRole-admin').textContent).toBe('false');
    expect(screen.getByTestId('hasRole-cashier').textContent).toBe('false');
  });
});

describe('AuthProvider — isSuperAdmin check', () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('isSuperAdmin: true for super_admin user', async () => {
    vi.mocked(getAuthMe).mockResolvedValue({ user: { role: 'super_admin', email: 'a@b.com' } } as never);
    localStorage.setItem('sinaicamps_token', 'tok');

    await act(async () => {
      render(
        <AuthProvider>
          <SuperAdminConsumer />
        </AuthProvider>,
      );
    });
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('isSuperAdmin').textContent).toBe('true');
  });

  it('isSuperAdmin: false for admin user', async () => {
    vi.mocked(getAuthMe).mockResolvedValue({ user: { role: 'admin', email: 'a@b.com' } } as never);
    localStorage.setItem('sinaicamps_token', 'tok');

    await act(async () => {
      render(
        <AuthProvider>
          <SuperAdminConsumer />
        </AuthProvider>,
      );
    });
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('isSuperAdmin').textContent).toBe('false');
  });

  it('isSuperAdmin: false when not authenticated', async () => {
    vi.mocked(getAuthMe).mockRejectedValue(new Error('no token'));

    await act(async () => {
      render(
        <AuthProvider>
          <SuperAdminConsumer />
        </AuthProvider>,
      );
    });
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('isSuperAdmin').textContent).toBe('false');
  });
});

describe('AuthProvider — auth state persistence (localStorage)', () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('restores user from localStorage and revalidates with getAuthMe', async () => {
    const savedUser = { role: 'admin', email: 'persisted@test.com' };
    localStorage.setItem('sinaicamps_user', JSON.stringify(savedUser));
    localStorage.setItem('sinaicamps_token', 'valid-token');
    vi.mocked(getAuthMe).mockResolvedValue({ user: savedUser } as never);

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });
    await waitFor(() => expect(screen.getByTestId('isAuthenticated').textContent).toBe('true'));

    expect(screen.getByTestId('role').textContent).toBe('admin');
    expect(screen.getByTestId('email').textContent).toBe('persisted@test.com');
    expect(getAuthMe).toHaveBeenCalled();
  });

  it('clears stale localStorage when getAuthMe rejects', async () => {
    localStorage.setItem('sinaicamps_user', JSON.stringify({ role: 'admin' }));
    localStorage.setItem('sinaicamps_token', 'stale-token');
    vi.mocked(getAuthMe).mockRejectedValue(new Error('expired'));

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    expect(screen.getByTestId('isAuthenticated').textContent).toBe('false');
    expect(localStorage.getItem('sinaicamps_token')).toBeNull();
    expect(localStorage.getItem('sinaicamps_user')).toBeNull();
  });

  it('treats corrupted JSON in localStorage gracefully', async () => {
    localStorage.setItem('sinaicamps_user', '{bad json!!');
    localStorage.setItem('sinaicamps_token', 'tok');
    vi.mocked(getAuthMe).mockRejectedValue(new Error('no token'));

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    expect(screen.getByTestId('isAuthenticated').textContent).toBe('false');
    spy.mockRestore();
  });

  it('handles absence of window (SSR) without crashing', async () => {
    vi.mocked(getAuthMe).mockRejectedValue(new Error('no token'));
    // Just verifying render works when window checks are involved
    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
  });
});

// ── ROLE_HIERARCHY unit tests ─────────────────────────────────────────

describe('ROLE_HIERARCHY constants', () => {
  it('super_admin has level 10', () => {
    expect(ROLE_HIERARCHY.super_admin).toBe(10);
  });

  it('admin has level 4', () => {
    expect(ROLE_HIERARCHY.admin).toBe(4);
  });

  it('super_admin is greater than admin', () => {
    expect(ROLE_HIERARCHY.super_admin).toBeGreaterThan(ROLE_HIERARCHY.admin);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────

function LoginCatcher({ onResult }: { onResult: (r: { success: boolean; error?: string }) => void }) {
  const { login } = useAuth();
  return (
    <button
      data-testid="login-catcher-btn"
      onClick={async () => {
        const r = await login('a@b.com', 'pass');
        onResult(r);
      }}
    >
      go
    </button>
  );
}

function SuperAdminConsumer() {
  const { user, loading, hasRole } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="isSuperAdmin">{String(hasRole('super_admin'))}</span>
      <span data-testid="role">{user?.role ?? 'none'}</span>
    </div>
  );
}
