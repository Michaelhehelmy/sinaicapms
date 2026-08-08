import React, { useState, useEffect } from 'react';
import { useSettingsQuery, useUpdateSettingsMutation } from '@/hooks/useQueryHooks';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card, CardHeader } from '@/components/ui/Card';
import type { TenantSettings } from '@/hooks/useAdminData';

const currencyOptions = [
  { value: 'EGP', label: 'EGP (Egyptian Pound)' },
  { value: 'USD', label: 'USD (US Dollar)' },
  { value: 'EUR', label: 'EUR (Euro)' },
  { value: 'GBP', label: 'GBP (British Pound)' },
  { value: 'SAR', label: 'SAR (Saudi Riyal)' },
  { value: 'AED', label: 'AED (UAE Dirham)' },
];

export default function SettingsPanel() {
  const { data: settings, isLoading } = useSettingsQuery();
  const saveMutation = useUpdateSettingsMutation();

  const [form, setForm] = useState<TenantSettings>({
    name: '',
    primaryColor: '#4a7c4f',
    whatsappNumber: '',
    phone: '',
    email: '',
    location: '',
    logoUrl: '',
    faviconUrl: '',
    description: '',
    footerText: '',
    currency: 'EGP',
  });

  useEffect(() => {
    if (settings) {
      setForm({
        name: settings.name || '',
        primaryColor: settings.primaryColor || '#4a7c4f',
        whatsappNumber: settings.whatsappNumber || '',
        phone: settings.phone || '',
        email: settings.email || '',
        location: settings.location || '',
        logoUrl: settings.logoUrl || '',
        faviconUrl: settings.faviconUrl || '',
        description: settings.description || '',
        footerText: settings.footerText || '',
        currency: settings.currency || 'EGP',
      });
    }
  }, [settings]);

  const updateField = (field: keyof TenantSettings, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    const data = {
      name: form.name.trim(),
      primaryColor: form.primaryColor,
      whatsappNumber: form.whatsappNumber.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      location: form.location.trim(),
      logoUrl: form.logoUrl.trim() || undefined,
      faviconUrl: form.faviconUrl.trim() || undefined,
      description: form.description.trim(),
      footerText: form.footerText.trim(),
      currency: form.currency || 'EGP',
    };
    saveMutation.mutate(data);
  };

  return (
    <div data-testid="settings-panel">
      {isLoading ? <LoadingSpinner text="Loading settings..." /> : (
      <>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold text-gray-800">Settings</h2>
        <Button
          variant="success"
          size="md"
          onClick={handleSave}
          disabled={saveMutation.isPending}
          loading={saveMutation.isPending}
          data-testid="settings-save-btn"
          leftIcon={
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          }
        >
          Save Settings
        </Button>
      </div>
      <p className="text-sm text-gray-500 mb-6">Configure your camp portal theme, display name, and contact details.</p>

      <div data-testid="settings-form" className="space-y-6">
        {/* Basic Info Section */}
        <Card>
          <CardHeader>
            <h3 className="text-base font-bold text-gray-800">Basic Info</h3>
          </CardHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-6 py-4">
            <Input
              label="Display Name"
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
            />
            <div>
              <label htmlFor="primary-color" className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
              <div className="flex items-center gap-2">
                <input
                  id="primary-color"
                  type="color"
                  value={form.primaryColor}
                  onChange={(e) => updateField('primaryColor', e.target.value)}
                  className="h-10 w-12 rounded cursor-pointer border border-gray-300"
                />
                <Input
                  label="Hex Color"
                  type="text"
                  value={form.primaryColor}
                  onChange={(e) => updateField('primaryColor', e.target.value)}
                />
              </div>
            </div>
            <Select
              label="Currency"
              options={currencyOptions}
              value={form.currency}
              onChange={(e) => updateField('currency', e.target.value)}
            />
            <div className="md:col-span-2">
              <label htmlFor="settings-description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                id="settings-description"
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:border-brand-500 focus:ring-brand-500"
                rows={3}
              />
            </div>
          </div>
        </Card>

        {/* Contact Section */}
        <Card>
          <CardHeader>
            <h3 className="text-base font-bold text-gray-800">Contact</h3>
          </CardHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-6 py-4">
            <Input
              label="WhatsApp Number"
              type="tel"
              value={form.whatsappNumber}
              onChange={(e) => updateField('whatsappNumber', e.target.value)}
              placeholder="+1 234 567 890"
            />
            <Input
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={(e) => updateField('phone', e.target.value)}
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
            />
            <Input
              label="Location"
              type="text"
              value={form.location}
              onChange={(e) => updateField('location', e.target.value)}
            />
          </div>
        </Card>

        {/* Branding Section */}
        <Card data-testid="branding-section">
          <CardHeader>
            <h3 className="text-base font-bold text-gray-800">Branding</h3>
          </CardHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-6 py-4">
            <Input
              label="Logo URL"
              type="text"
              value={form.logoUrl}
              onChange={(e) => updateField('logoUrl', e.target.value)}
              placeholder="https://..."
            />
            <Input
              label="Favicon URL"
              type="text"
              value={form.faviconUrl}
              onChange={(e) => updateField('faviconUrl', e.target.value)}
              placeholder="https://..."
            />
            <div className="md:col-span-2">
              <Input
                label="Footer Text"
                type="text"
                value={form.footerText}
                onChange={(e) => updateField('footerText', e.target.value)}
              />
            </div>
          </div>
        </Card>
      </div>
      </>
      )}
    </div>
  );
}
