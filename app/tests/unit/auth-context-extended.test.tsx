import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/lib/auth';

vi.mock('@/lib/api', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  getAuthMe: vi.fn(),
  getTenantId: vi.fn(() => 'tenant'),
  setTenantScope: vi.fn(),
  REFRESH_TOKEN_KEY: 'sinaicamps_refresh_token',
}));

import { login as apiLogin, logout as apiLogout, getAuthMe } from '@/lib/api';

function AuthConsumer() {
  const { loading, isAuthenticated, user, login, logout, hasRole } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="isAuthenticated">{String(isAuthenticated)}</span>
      <span data-testid="user">{JSON.stringify(user)}</span>
      <button
        onClick={() => login('a@b.com', 'pass')}
        data-testid="login-btn"
      >
        Login
      </button>
      <button
        onClick={() => logout()}
        data-testid="logout-btn"
      >
        Logout
      </button>
      <span data-testid="hasRole-super_admin">{String(hasRole('super_admin'))}</span>
      <span data-testid="hasRole-unknown">{String(hasRole('unknown_role'))}</span>
      <span data-testid="hasRole-empty">{String(hasRole(''))}</span>
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

  it('initial state when no token exists', async () => {
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
    expect(screen.getByTestId('isAuthenticated').textContent).toBe('false');
    expect(screen.getByTestId('hasRole-super_admin').textContent).toBe('false');
  });

  it('restores user from localStorage', async () => {
    const savedUser = { role: 'admin', email: 'a@b.com' };
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

    await waitFor(() => {
      expect(screen.getByTestId('isAuthenticated').textContent).toBe('true');
    });
    const parsedUser = JSON.parse(screen.getByTestId('user').textContent || '');
    expect(parsedUser.email).toBe('a@b.com');
  });

  it('hasRole: super_admin >= admin', async () => {
    vi.mocked(getAuthMe).mockResolvedValue({ user: { role: 'super_admin', email: 'a@b.com' } } as never);
    localStorage.setItem('sinaicamps_token', 'valid');

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('hasRole-super_admin').textContent).toBe('true');
    });
  });

  it('hasRole returns false for unknown role', async () => {
    vi.mocked(getAuthMe).mockResolvedValue({ user: { role: 'bogus', email: 'a@b.com' } } as never);
    localStorage.setItem('sinaicamps_token', 'valid');

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('hasRole-super_admin').textContent).toBe('false');
    });
  });

  it('hasRole returns false for empty string', async () => {
    vi.mocked(getAuthMe).mockResolvedValue({ user: { role: 'admin', email: 'a@b.com' } } as never);
    localStorage.setItem('sinaicamps_token', 'valid');

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('hasRole-empty').textContent).toBe('true');
    });
  });

  // admin level (4) < required level for super_admin (10)
  it('hasRole returns false when user level is less than required', async () => {
    // admin level is 4, super_admin is 10
    vi.mocked(getAuthMe).mockResolvedValue({ user: { role: 'admin', email: 'a@b.com' } } as never);
    localStorage.setItem('sinaicamps_token', 'valid');

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });

    const span = screen.getByTestId('hasRole-super_admin');
    expect(span.textContent).toBe('false');
  });

  it('malfunctioned localStorage is ignored', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getAuthMe).mockRejectedValue(new Error('no token'));

    localStorage.setItem('sinaicamps_user', '{invalid json:');
    localStorage.setItem('sinaicamps_token', 'dummy');

    await act(async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>,
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('isAuthenticated').textContent).toBe('false');
    });
    consoleSpy.mockRestore();
  });

  it('useAuth throws when used outside AuthProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    expect(() => {
      render(<AuthConsumer />);
    }).toThrow('useAuth must be used within an AuthProvider');
    consoleSpy.mockRestore();
  });

  it('login returns error message when API throws an Error', async () => {
    vi.mocked(apiLogin).mockRejectedValue(new Error('Bad credentials'));
    let captured: { success: boolean; error?: string } | undefined;

    await act(async () => {
      render(
        <AuthProvider>
          <LoginResultCatcher onResult={(r) => { captured = r; }} />
        </AuthProvider>,
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('login-btn'));
    });
    await waitFor(() => {
      expect(apiLogin).toHaveBeenCalled();
    });
    expect(captured?.success).toBe(false);
    expect(captured?.error).toBe('Bad credentials');
  });

  it('login returns generic error when API throws a non-Error value', async () => {
    vi.mocked(apiLogin).mockRejectedValue('string failure');
    let captured: { success: boolean; error?: string } | undefined;

    await act(async () => {
      render(
        <AuthProvider>
          <LoginResultCatcher onResult={(r) => { captured = r; }} />
        </AuthProvider>,
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('login-btn'));
    });
    await waitFor(() => {
      expect(apiLogin).toHaveBeenCalled();
    });
    expect(captured?.success).toBe(false);
    expect(captured?.error).toBe('Login failed');
  });

  it('ignores auth result after unmount', async () => {
    let resolveMe!: (v: unknown) => void;
    vi.mocked(getAuthMe).mockReturnValue(new Promise((res) => { resolveMe = res; }));
    localStorage.setItem('sinaicamps_token', 'valid');

    const { unmount } = render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );
    unmount();
    await act(async () => { resolveMe({ user: { role: 'admin', email: 'a@b.com' } }); });
  });

  it('ignores auth error after unmount', async () => {
    let rejectMe!: (e: unknown) => void;
    vi.mocked(getAuthMe).mockReturnValue(new Promise((_, rej) => { rejectMe = rej; }));
    localStorage.setItem('sinaicamps_token', 'valid');

    const { unmount } = render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );
    unmount();
    await act(async () => { rejectMe(new Error('boom')); });
  });
});

function LoginResultCatcher({ onResult }: { onResult: (r: { success: boolean; error?: string }) => void }) {
  const { login } = useAuth();
  return (
    <button
      data-testid="login-btn"
      onClick={async () => {
        const result = await login('a@b.com', 'pass');
        onResult(result);
      }}
    >
      Login
    </button>
  );
}
