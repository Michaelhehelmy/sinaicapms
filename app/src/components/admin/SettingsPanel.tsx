import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSettingsQuery, useUpdateSettingsMutation } from '@/hooks/useQueryHooks';
import * as api from '@/lib/api';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card, CardHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import type { TenantSettings } from '@/hooks/useAdminData';

const currencyOptions = [
  { value: 'EGP', label: 'EGP (Egyptian Pound)' },
  { value: 'USD', label: 'USD (US Dollar)' },
  { value: 'EUR', label: 'EUR (Euro)' },
  { value: 'GBP', label: 'GBP (British Pound)' },
  { value: 'SAR', label: 'SAR (Saudi Riyal)' },
  { value: 'AED', label: 'AED (UAE Dirham)' },
];

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
const FALLBACK_AVATAR = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="%239ca3af" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>';

/**
 * URL/asset field with an inline upload button (R2 via api.upload) and a
 * small live preview. Uploads write the returned `/api/media/{key}` URL back
 * into the field; users can also paste an absolute URL directly.
 */
function AssetField({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      setUploading(true);
      try {
        const res = await api.upload(file);
        onChange(res.url);
        showToast('Image uploaded.', 'success');
      } catch (err) {
        showToast('Failed to upload image: ' + (err instanceof Error ? err.message : String(err)), 'error');
      } finally {
        setUploading(false);
      }
    },
    [onChange, showToast],
  );

  return (
    <div data-testid={testId}>
      <div className="flex items-center gap-3 mb-1">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
          {value ? (
            <img
              src={value}
              alt={label}
              className="h-full w-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
            />
          ) : (
            <img src={FALLBACK_AVATAR} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <label className="block text-sm font-medium text-gray-700">{label}</label>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            aria-label={label}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://… or /api/media/…"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          loading={uploading}
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          className="hidden"
          data-testid={`${testId ?? 'asset'}-file-input`}
          onChange={handleFile}
        />
      </div>
    </div>
  );
}

/** Parse a JSON array string defensively; returns [] on failure. */
function parseJsonArray(raw: string | undefined | null): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function SettingsPanel() {
  const { data: settings, isLoading } = useSettingsQuery();
  const saveMutation = useUpdateSettingsMutation();
  const { showToast } = useToast();

  const [galleryInput, setGalleryInput] = useState<string>('');

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
    heroImageUrl: '',
    galleryImages: '[]',
    aboutText: '',
    faqItems: '[]',
    reviews: '[]',
    mapEmbedUrl: '',
    activities: '',
    capacity: undefined,
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
        heroImageUrl: settings.heroImageUrl || '',
        galleryImages: settings.galleryImages || '[]',
        aboutText: settings.aboutText || '',
        faqItems: settings.faqItems || '[]',
        reviews: settings.reviews || '[]',
        mapEmbedUrl: settings.mapEmbedUrl || '',
        activities: settings.activities || '',
        capacity: settings.capacity ?? undefined,
      });
      setGalleryInput(String(settings.galleryImages ?? '[]'));
    }
  }, [settings]);

  const updateField = (field: keyof TenantSettings, value: string | number | undefined) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const addGalleryUrl = useCallback(() => {
    const url = galleryInput.trim();
    if (!url) {
      showToast('Paste an image URL first.', 'warning');
      return;
    }
    const current = parseJsonArray(form.galleryImages);
    current.push(url);
    setForm((prev) => ({ ...prev, galleryImages: JSON.stringify(current) }));
    setGalleryInput('');
  }, [galleryInput, form.galleryImages, showToast]);

  const removeGalleryItem = useCallback((index: number) => {
    const current = parseJsonArray(form.galleryImages);
    current.splice(index, 1);
    setForm((prev) => ({ ...prev, galleryImages: JSON.stringify(current) }));
  }, [form.galleryImages]);

  const handleSave = () => {
    // Validate structured JSON fields before sending.
    const jsonFields: Array<[keyof TenantSettings, string]> = [
      ['galleryImages', form.galleryImages ?? '[]'],
      ['faqItems', form.faqItems ?? '[]'],
      ['reviews', form.reviews ?? '[]'],
    ];
    for (const [field, raw] of jsonFields) {
      try {
        JSON.parse(raw || '[]');
      } catch {
        showToast(`${String(field).replace(/([A-Z])/g, ' $1')} must be valid JSON.`, 'warning');
        return;
      }
    }

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
      heroImageUrl: (form.heroImageUrl ?? '').trim() || undefined,
      galleryImages: (form.galleryImages ?? '[]').trim() || undefined,
      aboutText: (form.aboutText ?? '').trim() || undefined,
      faqItems: (form.faqItems ?? '[]').trim() || undefined,
      reviews: (form.reviews ?? '[]').trim() || undefined,
      mapEmbedUrl: (form.mapEmbedUrl ?? '').trim() || undefined,
      activities: (form.activities ?? '').trim() || undefined,
      capacity: form.capacity ?? undefined,
    };
    saveMutation.mutate(data);
  };

  const galleryItems = parseJsonArray(form.galleryImages) as string[];

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
      <p className="text-sm text-gray-500 mb-6">Configure your camp portal theme, display name, contact details, and the public-facing storefront content.</p>

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
            <AssetField
              label="Logo"
              testId="settings-logo-field"
              value={form.logoUrl || ''}
              onChange={(v) => updateField('logoUrl', v)}
            />
            <AssetField
              label="Favicon"
              testId="settings-favicon-field"
              value={form.faviconUrl || ''}
              onChange={(v) => updateField('faviconUrl', v)}
            />
            <div className="md:col-span-2">
              <AssetField
                label="Hero Image (shown at the top of your public pages)"
                testId="settings-hero-field"
                value={form.heroImageUrl || ''}
                onChange={(v) => { updateField('heroImageUrl', v); }}
              />
            </div>
          </div>
        </Card>

        {/* Storefront Content Section */}
        <Card data-testid="storefront-content-section">
          <CardHeader>
            <h3 className="text-base font-bold text-gray-800">Storefront Content</h3>
          </CardHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-6 py-4">
            <div className="md:col-span-2">
              <label htmlFor="settings-about" className="block text-sm font-medium text-gray-700 mb-1">About Text (used on your landing + about page)</label>
              <textarea
                id="settings-about"
                value={form.aboutText || ''}
                onChange={(e) => updateField('aboutText', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:border-brand-500 focus:ring-brand-500"
                rows={4}
                placeholder="Tell visitors about your camp…"
              />
            </div>
            <Input
              label="Activities (comma-separated)"
              type="text"
              value={form.activities || ''}
              onChange={(e) => updateField('activities', e.target.value)}
              placeholder="Hiking, Diving, Camping, Yoga"
            />
            <Input
              label="Capacity"
              type="number"
              value={form.capacity === undefined ? '' : String(form.capacity)}
              onChange={(e) => updateField('capacity', e.target.value === '' ? undefined : Number(e.target.value))}
              min="0"
            />
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Footer Text</label>
              <Input
                label="Footer Text"
                type="text"
                value={form.footerText}
                onChange={(e) => updateField('footerText', e.target.value)}
                placeholder="© 2026 Acacia Camp. All rights reserved."
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="settings-map" className="block text-sm font-medium text-gray-700 mb-1">Map Embed URL</label>
              <Input
                id="settings-map"
                label="Map Embed URL"
                type="text"
                value={form.mapEmbedUrl || ''}
                onChange={(e) => updateField('mapEmbedUrl', e.target.value)}
                placeholder="https://www.openstreetmap.org/export/embed.html?bbox=…"
              />
            </div>
          </div>
        </Card>

        {/* Gallery Section */}
        <Card data-testid="gallery-section">
          <CardHeader>
            <h3 className="text-base font-bold text-gray-800">Gallery</h3>
          </CardHeader>
          <div className="px-6 py-4 space-y-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  aria-label="Add image URL to gallery"
                  type="text"
                  value={galleryInput}
                  onChange={(e) => setGalleryInput(e.target.value)}
                  placeholder="Paste an image URL and press Add"
                />
              </div>
              <Button type="button" variant="secondary" size="md" onClick={addGalleryUrl}>
                Add
              </Button>
            </div>
            {galleryItems.length > 0 ? (
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-testid="gallery-items">
                {galleryItems.map((url, idx) => (
                  <li key={`${url}-${idx}`} className="group relative overflow-hidden rounded-lg border border-gray-200 bg-white">
                    <img src={url} alt={`Gallery ${idx + 1}`} className="h-24 w-full object-cover" />
                    <button
                      type="button"
                      aria-label="Remove gallery image"
                      onClick={() => removeGalleryItem(idx)}
                      className="absolute right-1.5 top-1.5 rounded bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No gallery images yet — add URLs above or upload via Branding assets.</p>
            )}
            <p className="text-xs text-gray-500">Stored as a JSON array of image URLs rendered on your public gallery page.</p>
          </div>
        </Card>

        {/* Structured Content Section */}
        <Card data-testid="structured-content-section">
          <CardHeader>
            <h3 className="text-base font-bold text-gray-800">FAQ &amp; Reviews</h3>
          </CardHeader>
          <div className="grid grid-cols-1 gap-4 px-6 py-4">
            <div>
              <label htmlFor="settings-faq" className="block text-sm font-medium text-gray-700 mb-1">FAQ Items (JSON array)</label>
              <textarea
                id="settings-faq"
                value={form.faqItems || '[]'}
                onChange={(e) => updateField('faqItems', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:border-brand-500 focus:ring-brand-500 font-mono"
                rows={6}
                placeholder={JSON.stringify([{ question: 'What time is check-in?', answer: 'Check-in is at 2 PM.' }], null, 2)}
              />
            </div>
            <div>
              <label htmlFor="settings-reviews" className="block text-sm font-medium text-gray-700 mb-1">Reviews (JSON array)</label>
              <textarea
                id="settings-reviews"
                value={form.reviews || '[]'}
                onChange={(e) => updateField('reviews', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:border-brand-500 focus:ring-brand-500 font-mono"
                rows={6}
                placeholder={JSON.stringify([{ author: 'Guest', rating: 5, text: 'Amazing stay!' }], null, 2)}
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