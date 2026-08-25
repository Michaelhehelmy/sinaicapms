import React, { useState, useEffect, useCallback } from 'react';
import * as api from '@/lib/api';

type WizardStep = 'profile' | 'branding' | 'complete';

export default function OnboardingWizard() {
  const [token, setToken] = useState('');
  const [step, setStep] = useState<WizardStep>('profile');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [siteUrl, setSiteUrl] = useState('');

  // Profile fields
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [description, setDescription] = useState('');
  const [capacity, setCapacity] = useState('');
  const [currency, setCurrency] = useState('EGP');
  const [activities, setActivities] = useState('');

  // Branding fields
  const [primaryColor, setPrimaryColor] = useState('#4a7c4f');

  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token') || '';
    if (!t) {
      setError('Invalid onboarding link. Please sign up first.');
      setLoading(false);
      return;
    }
    setToken(t);

    api.getOnboardingStatus(t)
      .then((res) => {
        const data = res as api.OnboardingStatus;
        if (data.setup_complete) {
          setTenantId(data.tenant_id);
          setSiteUrl(`https://${data.subdomain}.sinaicamps.com`);
          setStep('complete');
        } else {
          setTenantName(data.name);
          setTenantId(data.tenant_id);
          if (data.profile.location) setLocation(data.profile.location);
          if (data.profile.phone) setPhone(data.profile.phone);
          if (data.profile.description) setDescription(data.profile.description);
          if (data.profile.primary_color) setPrimaryColor(data.profile.primary_color);
          if (data.profile.capacity) setCapacity(String(data.profile.capacity));
          if (data.profile.currency) setCurrency(data.profile.currency);
        }
      })
      .catch((err) => {
        setError('Failed to load onboarding status: ' + (err instanceof Error ? err.message : String(err)));
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSaveProfile = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      await api.updateOnboardingTenant({
        token,
        location: location || undefined,
        phone: phone || undefined,
        description: description || undefined,
        capacity: capacity ? parseInt(capacity) : undefined,
        currency,
        activities: activities || undefined,
      });
      setStep('branding');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }, [token, location, phone, description, capacity, currency, activities]);

  const handleComplete = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      const res = await api.completeOnboarding({
        token,
        location: location || undefined,
        phone: phone || undefined,
        description: description || undefined,
        primary_color: primaryColor,
        capacity: capacity ? parseInt(capacity) : undefined,
        currency,
        activities: activities || undefined,
      });
      const result = res as api.OnboardingSetupResult;
      if (result.success) {
        setSiteUrl(result.site_url);
        setStep('complete');
      } else {
        throw new Error('Setup failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete setup');
    } finally {
      setSaving(false);
    }
  }, [token, location, phone, description, primaryColor, capacity, currency, activities]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-white">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-500">Loading setup wizard...</p>
        </div>
      </div>
    );
  }

  // ── Complete Screen ──────────────────────────────────────────────────
  if (step === 'complete') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-white px-4">
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-2xl border border-gray-200 p-10 shadow-lg text-center">
            <div className="mx-auto mb-5 h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-3">Your Site is Live!</h2>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              {tenantName} has been set up and is ready for visitors.
            </p>
            {siteUrl && (
              <a
                href={siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-lg bg-emerald-600 px-8 py-3 text-sm font-semibold text-white hover:bg-emerald-700 no-underline transition-colors mb-4"
                data-testid="visit-site-link"
              >
                Visit Your Site
              </a>
            )}
            <div className="mt-4">
              <a
                href={`/admin`}
                className="text-sm text-emerald-600 hover:text-emerald-700 no-underline font-medium"
              >
                Go to Admin Dashboard
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Wizard Steps ──────────────────────────────────────────────────────
  const progress = step === 'profile' ? 50 : 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-white px-4 py-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Set Up {tenantName}</h1>
          <p className="text-gray-500">Complete your profile to go live.</p>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span className={step === 'profile' ? 'text-emerald-600 font-semibold' : 'text-emerald-600'}>Profile</span>
            <span className={step === 'branding' ? 'text-emerald-600 font-semibold' : step === 'complete' ? 'text-emerald-600' : 'text-gray-400'}>Branding</span>
            <span className={step === 'complete' ? 'text-emerald-600 font-semibold' : 'text-gray-400'}>Done</span>
          </div>
          <div className="bg-gray-200 rounded-full h-2">
            <div className="bg-emerald-500 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-lg">
          {error && (
            <div className="mb-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700" data-testid="onboarding-error">
              {error}
            </div>
          )}

          {/* Step 1: Profile */}
          {step === 'profile' && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-gray-800 mb-1">Basic Information</h2>
              <p className="text-sm text-gray-500 mb-4">Tell visitors about your business.</p>

              <div>
                <label className={labelClass}>Location</label>
                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} placeholder="e.g., Sharm El Sheikh, Egypt" data-testid="onboarding-location" />
              </div>

              <div>
                <label className={labelClass}>Phone</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="+20 123 456 7890" data-testid="onboarding-phone" />
              </div>

              <div>
                <label className={labelClass}>Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} resize-none`} rows={3} placeholder="A short description of your business..." data-testid="onboarding-description" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Capacity</label>
                  <input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inputClass} placeholder="50" min="1" data-testid="onboarding-capacity" />
                </div>
                <div>
                  <label className={labelClass}>Currency</label>
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass} data-testid="onboarding-currency">
                    <option value="EGP">EGP (Egyptian Pound)</option>
                    <option value="USD">USD (US Dollar)</option>
                    <option value="EUR">EUR (Euro)</option>
                    <option value="GBP">GBP (British Pound)</option>
                    <option value="SAR">SAR (Saudi Riyal)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClass}>Activities</label>
                <input type="text" value={activities} onChange={(e) => setActivities(e.target.value)} className={inputClass} placeholder="e.g., Diving, Safari, Hiking" data-testid="onboarding-activities" />
              </div>

              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="w-full rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer border-none transition-colors"
                data-testid="onboarding-next"
              >
                {saving ? 'Saving...' : 'Next: Branding'}
              </button>
            </div>
          )}

          {/* Step 2: Branding */}
          {step === 'branding' && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-gray-800 mb-1">Branding</h2>
              <p className="text-sm text-gray-500 mb-4">Choose your brand color.</p>

              <div>
                <label className={labelClass}>Primary Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-10 w-14 rounded border border-gray-300 cursor-pointer"
                    data-testid="onboarding-color"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className={`${inputClass} w-32`}
                    placeholder="#4a7c4f"
                  />
                  <div className="flex gap-2 ml-4">
                    {['#4a7c4f', '#1e40af', '#9333ea', '#dc2626', '#0891b2', '#ca8a04'].map((c) => (
                      <button
                        key={c}
                        onClick={() => setPrimaryColor(c)}
                        className="w-7 h-7 rounded-full border-2 border-transparent hover:border-gray-400 cursor-pointer transition-colors"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Color preview */}
              <div className="rounded-xl overflow-hidden border border-gray-200">
                <div className="px-6 py-4 text-white font-semibold" style={{ backgroundColor: primaryColor }}>
                  {tenantName}
                </div>
                <div className="p-4 bg-gray-50">
                  <div className="h-3 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep('profile')}
                  className="flex-1 rounded-lg bg-gray-100 px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-200 cursor-pointer border-none transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleComplete}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer border-none transition-colors"
                  data-testid="onboarding-complete"
                >
                  {saving ? 'Launching...' : 'Launch Site'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
