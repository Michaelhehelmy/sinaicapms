import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { getAuthMe, login as apiLogin, logout as apiLogout, getTenantId, setTenantScope } from './api';
import { session } from './session';
import { roleAtLeast } from './rbac';

// Phase 6 / Task 3: hierarchy lives in ./rbac (mirrors backend ROLE_RANKS).
export { ROLE_HIERARCHY } from './rbac';

export interface AuthUser {
  userId?: string;
  id?: string;
  sub?: string;
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  role?: string;
  tenantId?: string;
  [key: string]: unknown;
}

export interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  hasRole: (minRole: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => session.getUser<AuthUser>('admin'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function validate() {
      const token = session.getAccessToken('admin');
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const res = await getAuthMe();
        if (cancelled) return;
        const userData = (res as Record<string, unknown>).user as AuthUser | undefined;
        if (userData) {
          setUser(userData);
          session.setUser('admin', userData);
        }
      } catch {
        if (cancelled) return;
        session.clear('admin');
        setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    validate();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
      setLoading(true);
      try {
        const tenantId = getTenantId();
        const res = await apiLogin(email, password, tenantId || undefined) as Record<string, unknown>;
        const token = res.token as string | undefined;
        const userData = (res.user as AuthUser) || (res.data as Record<string, unknown>)?.user as AuthUser | undefined;
        const tokens = (res.data as Record<string, unknown>)?.tokens as Record<string, unknown> | undefined;
        const accessToken = (tokens?.accessToken as string) || token;
        const refreshToken = (res.refreshToken as string) || (tokens?.refreshToken as string) || undefined;

        if (accessToken) {
          session.setTokens('admin', accessToken, refreshToken ?? null);
          // Refresh the cached user blob alongside tokens so /auth/me
          // validation has a fallback identity even before it runs.
          if (userData) session.setUser('admin', userData);
        }
        if (userData) {
          setUser(userData);
        }
        return { success: true };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Login failed';
        return { success: false, error: message };
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      /* best-effort */
    }
    // T9: clear any active super-admin tenant-scope override so a subsequent
    // login (e.g. as a tenant admin) never inherits the drill-down scope.
    setTenantScope(null);
    session.clear('admin');
    setUser(null);
  }, []);

  const hasRole = useCallback(
    (minRole: string): boolean => roleAtLeast(user?.role, minRole),
    [user],
  );

  const isAuthenticated = Boolean(user);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAuthenticated,
      login,
      logout,
      hasRole,
    }),
    [user, loading, isAuthenticated, login, logout, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
