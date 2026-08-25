import React, { useState } from 'react';
import * as api from '@/lib/api';

export default function SignupPage() {
  const [step, setStep] = useState<'signup' | 'success'>('signup');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [onboardingUrl, setOnboardingUrl] = useState('');

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [businessType, setBusinessType] = useState('camp');

  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

  const generateSubdomain = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleSignup = async () => {
    setError('');

    if (!firstName.trim() || !lastName.trim()) { setError('Full name is required'); return; }
    if (!email.trim()) { setError('Email is required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Please enter a valid email'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (!businessName.trim()) { setError('Business name is required'); return; }
    if (!subdomain.trim()) { setError('Subdomain is required'); return; }
    if (!/^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/.test(subdomain)) {
      setError('Subdomain must be lowercase with hyphens (e.g., my-camp)');
      return;
    }

    setLoading(true);
    try {
      const res = await api.signupTenant({
        name: businessName.trim(),
        subdomain: subdomain.trim(),
        business_type: businessType,
        email: email.trim(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      const result = res as api.OnboardingSignupResult;
      if (result.success && result.onboarding_token) {
        setOnboardingUrl(`/onboarding?token=${result.onboarding_token}`);
        setStep('success');
      } else {
        throw new Error('Signup failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-white px-4">
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-2xl border border-gray-200 p-10 shadow-lg text-center">
            <div className="mx-auto mb-5 h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-3">Account Created!</h2>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              Your account is ready. Complete the setup wizard to configure your site and go live.
            </p>
            <a
              href={onboardingUrl}
              className="inline-block rounded-lg bg-emerald-600 px-8 py-3 text-sm font-semibold text-white hover:bg-emerald-700 no-underline transition-colors"
              data-testid="onboarding-link"
            >
              Complete Setup
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-white px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Get Started with SinaiCamps</h1>
          <p className="text-gray-500">Create your camp management site in minutes.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-lg">
          {error && (
            <div className="mb-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700" data-testid="signup-error">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>First Name</label>
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} autoComplete="given-name" data-testid="signup-first-name" />
              </div>
              <div>
                <label className={labelClass}>Last Name</label>
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} autoComplete="family-name" data-testid="signup-last-name" />
              </div>
            </div>

            <div>
              <label className={labelClass}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="you@example.com" autoComplete="email" data-testid="signup-email" />
            </div>

            <div>
              <label className={labelClass}>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} minLength={6} autoComplete="new-password" data-testid="signup-password" />
            </div>

            <div>
              <label className={labelClass}>Business Name</label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => {
                  setBusinessName(e.target.value);
                  if (!subdomain || subdomain === generateSubdomain(businessName)) {
                    setSubdomain(generateSubdomain(e.target.value));
                  }
                }}
                className={inputClass}
                placeholder="e.g., Acacia Camp"
                data-testid="signup-business-name"
              />
            </div>

            <div>
              <label className={labelClass}>Subdomain</label>
              <div className="flex items-center">
                <input
                  type="text"
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className={`${inputClass} rounded-r-none`}
                  placeholder="my-camp"
                  data-testid="signup-subdomain"
                />
                <span className="bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg px-3 py-2.5 text-sm text-gray-500 whitespace-nowrap">.sinaicamps.com</span>
              </div>
            </div>

            <div>
              <label className={labelClass}>Business Type</label>
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className={inputClass}
                data-testid="signup-business-type"
              >
                <option value="camp">Camp / Lodge</option>
                <option value="supermarket">Supermarket / Shop</option>
                <option value="transportation">Transportation</option>
                <option value="other">Other</option>
              </select>
            </div>

            <button
              onClick={handleSignup}
              disabled={loading}
              className="w-full rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer border-none transition-colors"
              data-testid="signup-submit"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Already have an account?{' '}
              <a href="/admin" className="text-emerald-600 hover:text-emerald-700 no-underline font-medium">
                Sign In
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
