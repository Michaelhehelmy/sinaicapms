import React, { useState } from 'react';
import * as api from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-green-500';
  const labelClass = 'block text-sm font-semibold text-gray-700 mb-1';

  const handleSubmit = async () => {
    setError('');
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    setLoading(true);
    try {
      await api.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      // Even on error, show success to prevent user enumeration
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-xs text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Check Your Email</h2>
            <p className="text-sm text-gray-500 mb-6">
              If an account exists with <strong>{email}</strong>, a password reset link has been sent. Please check your inbox.
            </p>
            <a
              href="/login"
              className="inline-block rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 no-underline"
            >
              Back to Login
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-gray-800 text-center mb-2">Forgot Your Password?</h2>
          <p className="text-sm text-gray-500 text-center mb-6">
            Enter your email address and we&apos;ll send you a link to reset your password.
          </p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className={labelClass}>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="you@example.com"
                autoComplete="email"
                data-testid="forgot-email"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              data-testid="forgot-submit"
              className="w-full rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer border-none"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </div>

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
