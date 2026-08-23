import React, { useState, useEffect } from 'react';
import * as api from '@/lib/api';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-green-500';
  const labelClass = 'block text-sm font-semibold text-gray-700 mb-1';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tenantId') || params.get('tenant');
    setTenantId(t || api.getTenantId());
  }, []);

  const handleSubmit = async () => {
    setError('');

    if (!name.trim()) {
      setError('Full name is required');
      return;
    }
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }
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
      const res = (await api.registerUser({
        name: name.trim(),
        email: email.trim(),
        password,
        tenantId,
      })) as { success?: boolean };
      if (res && res.success) {
        setSuccess(true);
      } else {
        throw new Error('Server rejected the request');
      }
    } catch (err) {
      setError('Registration failed. Please try again or contact support.');
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
            <h2 className="text-xl font-bold text-gray-800 mb-2">Registration Successful</h2>
            <p className="text-sm text-gray-500 mb-6">
              Your account is pending administrator approval. You will be able to log in once your account has been approved.
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-gray-800 text-center mb-2">Create Your Account</h2>
          <p className="text-sm text-gray-500 text-center mb-6">
            Fill in the details below to register.
          </p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className={labelClass}>Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                autoComplete="name"
                data-testid="register-name"
              />
            </div>

            <div>
              <label className={labelClass}>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="you@example.com"
                autoComplete="email"
                data-testid="register-email"
              />
            </div>

            <div>
              <label className={labelClass}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                minLength={8}
                autoComplete="new-password"
                data-testid="register-password"
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
                data-testid="register-confirm-password"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              data-testid="register-submit"
              className="w-full rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer border-none"
            >
              {loading ? 'Registering...' : 'Register'}
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Already have an account?{' '}
              <a href="/login" className="text-green-600 hover:text-green-700 no-underline font-medium">
                Login
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
