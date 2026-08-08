import React, { useState, useEffect } from 'react';
import * as api from '@/lib/api';

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [tokenMissing, setTokenMissing] = useState(false);

  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-green-500';
  const labelClass = 'block text-sm font-semibold text-gray-700 mb-1';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (t) {
      setToken(t);
    } else {
      setTokenMissing(true);
      setError('No reset token found. Please request a new password reset link.');
    }
  }, []);

  const handleSubmit = async () => {
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = (await api.resetPassword(token, password)) as { success?: boolean };
      if (res && res.success) {
        setSuccess(true);
      } else {
        throw new Error('Server rejected the request');
      }
    } catch (err) {
      setError('Failed to reset password. The link may be expired or invalid.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-xs text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Password Reset Successfully</h2>
            <p className="text-sm text-gray-500 mb-6">
              Your password has been updated. You can now log in with your new password.
            </p>
            <a
              href="/login"
              className="inline-block rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 no-underline"
            >
              Go to Login
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-xs">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-gray-800 text-center mb-2">Reset Your Password</h2>
          <p className="text-sm text-gray-500 text-center mb-6">
            Enter your new password below.
          </p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!tokenMissing && (
            <div className="space-y-4">
              <div>
                <label className={labelClass}>New Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  minLength={8}
                  autoComplete="new-password"
                  data-testid="reset-password"
                />
              </div>

              <div>
                <label className={labelClass}>Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass}
                  autoComplete="new-password"
                  data-testid="reset-confirm-password"
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading}
                data-testid="reset-submit"
                className="w-full rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer border-none"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          )}

          <div className="mt-6 text-center">
            <a href="/login" className="text-sm text-green-600 hover:text-green-700 no-underline font-medium">
              &larr; Back to Login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
