import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { FormModal } from '@/components/ui/FormModal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { useAdminSettingsQuery, queryKeys } from '@/hooks/useQueryHooks';
import { getAdminSettings, updateAdminSettings } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

type SettingsTab = 'features' | 'emails' | 'defaults' | 'branding' | 'payments';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'features', label: 'Feature Flags' },
  { id: 'emails', label: 'Email Templates' },
  { id: 'defaults', label: 'Defaults' },
  { id: 'branding', label: 'Branding' },
  { id: 'payments', label: 'Payments' },
];

interface PaymentConfig {
  enabled: boolean;
  secretKeySet: boolean;
  hmacSecretSet: boolean;
  integrationIds: string;
  baseUrl: string;
  publicKey: string;
  currency: string;
  marketplaceFeePct: number;
}

// Local typed view of the GET /api/admin/settings response. The generated
// api-types.ts may not describe every section yet (P1-CONTRACT regenerates it
// in parallel), so we model the shape here and cast — matching the panel's
// existing pattern of reading `settings.featureFlags` etc. off the query data.
interface AdminSettingsShape {
  featureFlags?: Record<string, boolean>;
  emailTemplates?: Record<string, { subject: string; body: string }>;
  defaults?: { taxRate: number; currency: string; timezone: string; dateFormat: string };
  branding?: { platformName: string; logoUrl: string | null; faviconUrl: string | null; primaryColor: string };
  payment?: Partial<PaymentConfig>;
}

const FEATURE_FLAGS = [
  { key: 'financials', label: 'Financial Management', description: 'Double-entry accounting, invoicing, payments, tax reporting' },
  { key: 'hr', label: 'HR & Payroll', description: 'Employee management, leave tracking, payroll processing' },
  { key: 'supply', label: 'Supply Chain', description: 'Warehouses, stock tracking, purchase orders, manufacturing' },
  { key: 'crm', label: 'CRM & Projects', description: 'Contact management, leads, opportunities, tasks, tickets' },
  { key: 'storefront', label: 'E-Commerce Storefront', description: 'Product catalog, shopping cart, checkout, order management' },
  { key: 'ai', label: 'AI & Intelligence', description: 'Dynamic pricing, forecasting, anomaly detection, automation' },
];

const CURRENCIES = [
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'EGP', label: 'EGP - Egyptian Pound' },
  { value: 'SAR', label: 'SAR - Saudi Riyal' },
  { value: 'AED', label: 'AED - UAE Dirham' },
];

const TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Riyadh', label: 'Riyadh (AST)' },
  { value: 'Africa/Cairo', label: 'Cairo (EET)' },
];

const DATE_FORMATS = [
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY' },
];

export default function SystemSettingsPanel() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useAdminSettingsQuery();
  const [activeTab, setActiveTab] = useState<SettingsTab>('features');
  const [saving, setSaving] = useState(false);

  // Local editable state
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
  const [emailTemplates, setEmailTemplates] = useState<Record<string, { subject: string; body: string }>>({});
  const [defaults, setDefaults] = useState({ taxRate: 0, currency: 'USD', timezone: 'UTC', dateFormat: 'YYYY-MM-DD' });
  const [branding, setBranding] = useState({ platformName: 'SinaiCamps', logoUrl: null as string | null, faviconUrl: null as string | null, primaryColor: '#16a34a' });
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState({ subject: '', body: '' });
  const [payment, setPayment] = useState<PaymentConfig>({
    enabled: false,
    secretKeySet: false,
    hmacSecretSet: false,
    integrationIds: '',
    baseUrl: 'https://accept.paymob.com',
    publicKey: '',
    currency: 'EGP',
    marketplaceFeePct: 0,
  });
  // Secret fields — only sent when user types a NEW value (omission = keep)
  const [secretKeyValue, setSecretKeyValue] = useState('');
  const [hmacSecretValue, setHmacSecretValue] = useState('');

  useEffect(() => {
    if (settings) {
      const s = settings as AdminSettingsShape;
      setFeatureFlags(s.featureFlags || {});
      setEmailTemplates(s.emailTemplates || {});
      setDefaults(s.defaults || { taxRate: 0, currency: 'USD', timezone: 'UTC', dateFormat: 'YYYY-MM-DD' });
      setBranding(
        s.branding || {
          platformName: 'SinaiCamps',
          logoUrl: null as string | null,
          faviconUrl: null as string | null,
          primaryColor: '#16a34a',
        },
      );
      setPayment((prev) => ({
        ...prev,
        ...(s.payment || {}),
        integrationIds: s.payment?.integrationIds || prev.integrationIds,
        baseUrl: s.payment?.baseUrl || 'https://accept.paymob.com',
        publicKey: s.payment?.publicKey || prev.publicKey,
        currency: s.payment?.currency || 'EGP',
      }));
      // Reset secret input buffers on fresh data (kept for keep-existing behavior)
      setSecretKeyValue('');
      setHmacSecretValue('');
    }
  }, [settings]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (activeTab === 'features') payload.featureFlags = featureFlags;
      else if (activeTab === 'emails') payload.emailTemplates = emailTemplates;
      else if (activeTab === 'defaults') payload.defaults = defaults;
      else if (activeTab === 'branding') payload.branding = branding;
      else if (activeTab === 'payments') {
        const paymentPayload: Record<string, unknown> = {
          enabled: payment.enabled,
          integrationIds: payment.integrationIds,
          baseUrl: payment.baseUrl,
          publicKey: payment.publicKey,
          currency: payment.currency,
          marketplaceFeePct: payment.marketplaceFeePct,
        };
        // Only send a secret if the user typed a NEW value; omission keeps the stored one
        if (secretKeyValue.trim() !== '') paymentPayload.secretKey = secretKeyValue;
        if (hmacSecretValue.trim() !== '') paymentPayload.hmacSecret = hmacSecretValue;
        payload.payment = paymentPayload;
      }

      await updateAdminSettings(payload);
      queryClient.invalidateQueries({ queryKey: queryKeys.adminSettings });
      showToast('Settings saved', 'success');
    } catch (err) {
      showToast('Failed to save settings: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setSaving(false);
    }
  }, [activeTab, featureFlags, emailTemplates, defaults, branding, payment, secretKeyValue, hmacSecretValue, queryClient, showToast]);

  const toggleFlag = (key: string) => {
    setFeatureFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (isLoading) {
    return <LoadingSpinner text="Loading settings..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">System Settings</h2>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Feature Flags Tab */}
      {activeTab === 'features' && (
        <Card>
          <CardHeader>
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Feature Flags</h3>
              <p className="text-sm text-gray-500 mt-0.5">Toggle platform-wide features for all tenants</p>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              {FEATURE_FLAGS.map((flag) => (
                <div
                  key={flag.key}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800">{flag.label}</span>
                      <Badge variant={featureFlags[flag.key] ? 'success' : 'neutral'} size="sm">
                        {featureFlags[flag.key] ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{flag.description}</p>
                  </div>
                  <button
                    onClick={() => toggleFlag(flag.key)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
                      featureFlags[flag.key] ? 'bg-green-600' : 'bg-gray-300'
                    }`}
                    role="switch"
                    aria-checked={!!featureFlags[flag.key]}
                    data-testid={`flag-toggle-${flag.key}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        featureFlags[flag.key] ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Email Templates Tab */}
      {activeTab === 'emails' && (
        <Card>
          <CardHeader>
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Email Templates</h3>
              <p className="text-sm text-gray-500 mt-0.5">Configure transactional email content</p>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              {Object.entries(emailTemplates).map(([key, template]) => (
                <div
                  key={key}
                  className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-medium text-gray-800 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                      <span className="text-sm text-gray-500 ml-2">Subject: {template.subject}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditingEmail(key);
                        setEmailDraft({ subject: template.subject, body: template.body });
                      }}
                    >
                      Edit
                    </Button>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2">{template.body}</p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Email Edit Modal */}
      <FormModal
        open={!!editingEmail}
        title={`Edit ${editingEmail?.replace(/([A-Z])/g, ' $1') || ''} Template`}
        onClose={() => setEditingEmail(null)}
        onSubmit={() => {
          if (editingEmail) {
            setEmailTemplates((prev) => ({ ...prev, [editingEmail]: emailDraft }));
            setEditingEmail(null);
          }
        }}
        submitLabel="Save Template"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={emailDraft.subject}
              onChange={(e) => setEmailDraft((prev) => ({ ...prev, subject: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
            <textarea
              rows={8}
              value={emailDraft.body}
              onChange={(e) => setEmailDraft((prev) => ({ ...prev, body: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono text-sm"
            />
          </div>
        </div>
      </FormModal>

      {/* Defaults Tab */}
      {activeTab === 'defaults' && (
        <Card>
          <CardHeader>
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Platform Defaults</h3>
              <p className="text-sm text-gray-500 mt-0.5">Default values applied to new tenants</p>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tax Rate (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={defaults.taxRate}
                  onChange={(e) => setDefaults((prev) => ({ ...prev, taxRate: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  data-testid="setting-tax-rate"
                />
              </div>
              <div>
                <Select
                  label="Currency"
                  options={CURRENCIES}
                  value={defaults.currency}
                  onChange={(e) => setDefaults((prev) => ({ ...prev, currency: e.target.value }))}
                  data-testid="setting-currency"
                />
              </div>
              <div>
                <Select
                  label="Timezone"
                  options={TIMEZONES}
                  value={defaults.timezone}
                  onChange={(e) => setDefaults((prev) => ({ ...prev, timezone: e.target.value }))}
                  data-testid="setting-timezone"
                />
              </div>
              <div>
                <Select
                  label="Date Format"
                  options={DATE_FORMATS}
                  value={defaults.dateFormat}
                  onChange={(e) => setDefaults((prev) => ({ ...prev, dateFormat: e.target.value }))}
                  data-testid="setting-date-format"
                />
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Branding Tab */}
      {activeTab === 'branding' && (
        <Card>
          <CardHeader>
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Platform Branding</h3>
              <p className="text-sm text-gray-500 mt-0.5">Global platform name, logo, and colors</p>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Platform Name</label>
                <input
                  type="text"
                  value={branding.platformName}
                  onChange={(e) => setBranding((prev) => ({ ...prev, platformName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  data-testid="setting-platform-name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
                <input
                  type="text"
                  value={branding.logoUrl || ''}
                  onChange={(e) => setBranding((prev) => ({ ...prev, logoUrl: e.target.value || null }))}
                  placeholder="https://example.com/logo.png"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Favicon URL</label>
                <input
                  type="text"
                  value={branding.faviconUrl || ''}
                  onChange={(e) => setBranding((prev) => ({ ...prev, faviconUrl: e.target.value || null }))}
                  placeholder="https://example.com/favicon.ico"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={branding.primaryColor}
                    onChange={(e) => setBranding((prev) => ({ ...prev, primaryColor: e.target.value }))}
                    className="h-10 w-14 cursor-pointer rounded border border-gray-300"
                    data-testid="setting-primary-color"
                  />
                  <input
                    type="text"
                    value={branding.primaryColor}
                    onChange={(e) => setBranding((prev) => ({ ...prev, primaryColor: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono"
                  />
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Payments Tab */}
      {activeTab === 'payments' && (
        <Card>
          <CardHeader>
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Paymob Payments</h3>
              <p className="text-sm text-gray-500 mt-0.5">Configure Paymob gateway credentials for online reservations</p>
            </div>
          </CardHeader>
          <CardBody>
            {/* Enabled toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg mb-6">
              <div>
                <span className="font-medium text-gray-800">Paymob enabled (PM_ENABLED)</span>
                <p className="text-sm text-gray-500 mt-0.5">Allow tenants to accept online card payments via Paymob</p>
              </div>
              <button
                onClick={() => setPayment((prev) => ({ ...prev, enabled: !prev.enabled }))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
                  payment.enabled ? 'bg-green-600' : 'bg-gray-300'
                }`}
                role="switch"
                aria-checked={payment.enabled}
                data-testid="payment-enabled-toggle"
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    payment.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* PM_SECRET_KEY */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-sm font-medium text-gray-700">PM_SECRET_KEY</label>
                  {payment.secretKeySet && <Badge variant="success" size="sm">Configured ✓</Badge>}
                </div>
                <input
                  type="password"
                  value={secretKeyValue}
                  onChange={(e) => setSecretKeyValue(e.target.value)}
                  placeholder={payment.secretKeySet ? '•••••••• (set — leave blank to keep)' : 'Enter secret key'}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  data-testid="payment-secret-key"
                />
              </div>

              {/* PM_HMAC_SECRET */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-sm font-medium text-gray-700">PM_HMAC_SECRET</label>
                  {payment.hmacSecretSet && <Badge variant="success" size="sm">Configured ✓</Badge>}
                </div>
                <input
                  type="password"
                  value={hmacSecretValue}
                  onChange={(e) => setHmacSecretValue(e.target.value)}
                  placeholder={payment.hmacSecretSet ? '•••••••• (set — leave blank to keep)' : 'Enter HMAC secret'}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  data-testid="payment-hmac-secret"
                />
              </div>

              {/* PM_INTEGRATION_IDS */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PM_INTEGRATION_IDS</label>
                <input
                  type="text"
                  value={payment.integrationIds}
                  onChange={(e) => setPayment((prev) => ({ ...prev, integrationIds: e.target.value }))}
                  placeholder="Comma-separated IDs"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  data-testid="payment-integration-ids"
                />
              </div>

              {/* PM_BASE_URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PM_BASE_URL</label>
                <input
                  type="text"
                  value={payment.baseUrl}
                  onChange={(e) => setPayment((prev) => ({ ...prev, baseUrl: e.target.value }))}
                  placeholder="https://accept.paymob.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  data-testid="payment-base-url"
                />
              </div>

              {/* PM_PUBLIC_KEY */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PM_PUBLIC_KEY</label>
                <input
                  type="text"
                  value={payment.publicKey}
                  onChange={(e) => setPayment((prev) => ({ ...prev, publicKey: e.target.value }))}
                  placeholder="Public key"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  data-testid="payment-public-key"
                />
              </div>

              {/* PM_CURRENCY */}
              <div>
                <Select
                  label="PM_CURRENCY"
                  options={CURRENCIES}
                  value={payment.currency}
                  onChange={(e) => setPayment((prev) => ({ ...prev, currency: e.target.value }))}
                  data-testid="payment-currency"
                />
              </div>

              {/* Marketplace Fee % */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Marketplace commission (%) on online reservations
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={payment.marketplaceFeePct}
                  onChange={(e) => setPayment((prev) => ({ ...prev, marketplaceFeePct: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  data-testid="payment-marketplace-fee"
                />
              </div>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
