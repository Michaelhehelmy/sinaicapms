import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import * as apiClient from '@/lib/api';
import type { PosUser } from '../types';

// ─── Login View ────────────────────────────────────────────
export default function LoginView({ onLogin }: { onLogin: (u: PosUser, t: string) => void }) {
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
      localStorage.setItem('pos_token', data.token);
      localStorage.setItem('pos_user', JSON.stringify(data.user));
      onLogin(data.user, data.token);
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
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-3xl ring-4 ring-brand-100"
            aria-hidden="true"
          >
            🏕️
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
