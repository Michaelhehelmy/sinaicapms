import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { IconCamps } from '@/components/ui/icons';
import * as apiClient from '@/lib/api';
import { session } from '@/lib/session';
import type { PosUser } from '@/components/pos/types';

/**
 * Shared app-shell login form (Phase 8).
 *
 * One component, two realms — each ported VERBATIM from its pre-consolidation
 * implementation so markup, testids, labels, and behavior are pixel- and
 * behavior-identical:
 *
 * - `realm="pos"`   → terminal login. Calls `apiClient.posLogin` internally,
 *   persists tokens/user through the session kernel (legacy keys `pos_token`
 *   / `pos_user`), then hands the authenticated identity to `onPosSuccess`.
 * - `realm="admin"` → dashboard login. Delegates credential checking to the
 *   caller via `onAdminSubmit` (usually `useAuth().login`) and surfaces the
 *   returned error string.
 */

/* ─── realm: pos ─────────────────────────────────────────── */

function PosLoginForm({ onSuccess }: { onSuccess: (u: PosUser, t: string) => void }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await apiClient.posLogin(identifier, password);
      if (!data.success) {
        throw new Error('Login failed');
      }
      // Phase 6: tokens/user persist through the session kernel (same legacy
      // keys — pos_token / pos_user — so existing terminals keep working).
      session.setTokens('pos', data.token);
      session.setUser('pos', data.user);
      onSuccess(data.user, data.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-warm-100" data-testid="pos-login">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-warm-100 shadow-elevated p-6 sm:p-8">
        <div className="text-center mb-8">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-4 ring-brand-100"
            aria-hidden="true"
          >
            <IconCamps size={30} />
          </div>
          <h1 className="font-display text-2xl font-bold text-gray-900" data-testid="pos-branding">SinaiCamps POS</h1>
          <p className="text-sm text-warm-500 mt-1">Sign in to your terminal</p>
        </div>
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm" data-testid="pos-login-error">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4" data-testid="pos-login-form">
          <Input
            label="Email or Username"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            autoFocus
            autoComplete="username"
            name="identifier"
            data-testid="pos-identifier"
            className="min-h-[48px]"
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            data-testid="pos-password"
            className="min-h-[48px]"
          />
          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
            data-testid="pos-signin-btn"
            className="btn-primary min-h-[52px]"
          >
            Sign In
          </Button>
        </form>
      </div>
    </div>
  );
}

/* ─── realm: admin ───────────────────────────────────────── */

function AdminLoginForm({
  onSubmit,
}: {
  onSubmit: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }
    setLoading(true);
    setError('');
    const result = await onSubmit(email.trim(), password);
    setLoading(false);
    if (!result.success) {
      setError(result.error || 'Login failed');
    }
  };

  return (
    <div data-testid="login-overlay" className="fixed inset-0 z-[10000] flex items-center justify-center bg-stone-50">
      <div className="w-[90%] max-w-[400px] bg-white border border-gray-200 p-10 rounded-2xl shadow-lg text-center">
        <div className="mb-3 flex justify-center"><IconCamps size={48} /></div>
        <h2 className="text-2xl font-extrabold text-gray-800 mb-2">SinaiCamps</h2>
        <p className="text-sm text-gray-500 mb-8">Sign in to manage your camp platform</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="loginEmail" className="block text-sm font-semibold text-gray-600 mb-1.5 text-left">Email</label>
          <input
            type="email"
            required
            placeholder="admin@camp.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            id="loginEmail"
            data-testid="login-email"
            className="w-full p-3 rounded-lg border border-gray-300 text-sm font-[inherit] mb-4 focus:outline-none focus:border-green-600"
          />
          <label htmlFor="loginPassword" className="block text-sm font-semibold text-gray-600 mb-1.5 text-left">Password</label>
          <input
            type="password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            id="loginPassword"
            data-testid="login-password"
            className="w-full p-3 rounded-lg border border-gray-300 text-sm font-[inherit] mb-5 focus:outline-none focus:border-green-600"
          />
          {error && <p data-testid="login-error" className="text-red-600 text-xs mb-3">{error}</p>}
          <a href="/forgot-password" data-testid="forgot-password" className="text-sm text-green-600 hover:text-green-700 no-underline font-medium block text-center mb-4">
            Forgot Password?
          </a>
          <button
            type="submit"
            disabled={loading}
            data-testid="login-submit"
            className="w-full p-3.5 rounded-lg text-sm font-bold text-white bg-green-700 hover:bg-green-800 disabled:opacity-50 cursor-pointer border-none"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─── public surface ─────────────────────────────────────── */

interface LoginFormProps {
  realm: 'pos' | 'admin';
  /** realm="pos": called after successful posLogin + session persistence. */
  onPosSuccess?: (user: PosUser, token: string) => void;
  /** realm="admin": credential checker (typically useAuth().login). */
  onAdminSubmit?: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
}

export function LoginForm({ realm, onPosSuccess, onAdminSubmit }: LoginFormProps) {
  if (realm === 'admin') {
    if (!onAdminSubmit) throw new Error('LoginForm realm="admin" requires onAdminSubmit');
    return <AdminLoginForm onSubmit={onAdminSubmit} />;
  }
  if (!onPosSuccess) throw new Error('LoginForm realm="pos" requires onPosSuccess');
  return <PosLoginForm onSuccess={onPosSuccess} />;
}
