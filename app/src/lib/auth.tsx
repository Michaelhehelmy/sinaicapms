import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { getAuthMe, login as apiLogin, logout as apiLogout, getTenantId, REFRESH_TOKEN_KEY } from './api';

export const ROLE_HIERARCHY: Record<string, number> = {
  super_admin: 10,
  admin: 4,
};

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

const TOKEN_KEY = 'sinaicamps_token';
const USER_KEY = 'sinaicamps_user';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = localStorage.getItem(USER_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function validate() {
      const token = localStorage.getItem(TOKEN_KEY);
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
          localStorage.setItem(USER_KEY, JSON.stringify(userData));
        }
      } catch {
        if (cancelled) return;
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
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
          localStorage.setItem(TOKEN_KEY, accessToken);
        }
        if (refreshToken) {
          localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
        }
        if (userData) {
          localStorage.setItem(USER_KEY, JSON.stringify(userData));
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
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const hasRole = useCallback(
    (minRole: string): boolean => {
      if (!user?.role) return false;
      const userLevel = ROLE_HIERARCHY[user.role] ?? 0;
      const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;
      return userLevel >= requiredLevel;
    },
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
