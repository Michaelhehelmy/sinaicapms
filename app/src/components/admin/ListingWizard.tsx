import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/hooks/useI18n';
import {
  useSaveCampMutation,
  useSaveProductMutation,
  useSaveRatePlanMutation,
} from '@/hooks/useQueryHooks';
import { formatCurrency, cn } from '@/lib/utils';
import PhotosStep, { type WizardPhoto } from './PhotosStep';

/* ------------------------------------------------------------------ */
/*  Wizard constants                                                    */
/* ------------------------------------------------------------------ */

const STEPS = [
  { id: 'details', key: 'admin.wizardStepDetails' },
  { id: 'amenities', key: 'admin.wizardStepAmenities' },
  { id: 'pricing', key: 'admin.wizardStepPricing' },
  { id: 'photos', key: 'admin.wizardStepPhotos' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

/**
 * Static amenity toggles offered in the wizard.
 *
 * There is no amenities column in the product/camp schemas, so the selected
 * values are persisted deterministically into the product's `shortDescription`
 * (`Type · Amenity1 · Amenity2`), which is what the public product cards
 * render — no backend change required.
 */
const AMENITY_OPTIONS = [
  'WiFi',
  'Private Bathroom',
  'Hot Water',
  'Air Conditioning',
  'Heating',
  'BBQ Grill',
  'Fire Pit',
  'Parking',
  'Breakfast Included',
  'Lake View',
  'Mountain View',
  'Beach Access',
  'Pets Allowed',
  'Kitchenette',
  'Shared Bathroom',
];

/** Accommodation types — mirrors the flat option pattern in RoomsPanel. */
const accommodationTypeOptions = [
  { value: 'tent', label: 'Tent' },
  { value: 'cabin', label: 'Cabin' },
  { value: 'chalet', label: 'Chalet' },
  { value: 'villa', label: 'Villa' },
  { value: 'dorm', label: 'Dorm' },
  { value: 'glamping', label: 'Glamping Tent' },
];

/** Rate-plan seasons — values match RatePlansPanel/seasonOptions. */
const seasonOptions = [
  { value: 'all', label: 'All Seasons' },
  { value: 'peak', label: 'Peak' },
  { value: 'off', label: 'Off-Peak' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface ListingWizardProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful create so the parent can refresh listings. */
  onCreated: () => void;
}

interface WizardFormState {
  name: string;
  accommodationType: string;
  capacity: string;
  description: string;
  amenities: string[];
  basePrice: string;
  ratePlanName: string;
  season: string;
  minStay: string;
  startDate: string;
  endDate: string;
  photos: WizardPhoto[];
}

const emptyForm: WizardFormState = {
  name: '',
  accommodationType: '',
  capacity: '',
  description: '',
  amenities: [],
  basePrice: '',
  ratePlanName: '',
  season: 'all',
  minStay: '1',
  startDate: '',
  endDate: '',
  photos: [],
};

/**
 * 4-step listing creation wizard: details → amenities → pricing → photos.
 *
 * On submit it creates, in order, the camp, the product (room type associated
 * with the camp), and the product's seasonal rate plan via the existing admin
 * create APIs. Each mutation hook invalidates its own query key internally
 * (camps/products/ratePlans), so lists refresh without extra wiring.
 */
export default function ListingWizard({ open, onClose, onCreated }: ListingWizardProps) {
  const { t } = useI18n();
  const { showToast } = useToast();

  const [step, setStep] = useState<number>(0);
  const [form, setForm] = useState<WizardFormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // Mutation hooks always create (no editId). They toast + invalidate on
  // success and roll back/invalidate on failure internally.
  const saveCampMutation = useSaveCampMutation();
  const saveProductMutation = useSaveProductMutation();
  const saveRatePlanMutation = useSaveRatePlanMutation();

  // Reset the form every time the wizard opens so stale state never leaks
  // between listings.
  useEffect(() => {
    if (open) {
      setForm(emptyForm);
      setStep(0);
      setSubmitting(false);
    }
  }, [open]);

  const updateField = useCallback(<K extends keyof WizardFormState>(field: K, value: WizardFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const toggleAmenity = useCallback((amenity: string) => {
    setForm((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter((a) => a !== amenity)
        : [...prev.amenities, amenity],
    }));
  }, []);

  const typeLabel = useMemo(
    () => accommodationTypeOptions.find((o) => o.value === form.accommodationType)?.label ?? '',
    [form.accommodationType],
  );

  /** Generated product shortDescription: `Type · Amenity1 · Amenity2`. */
  const shortDescription = useMemo(() => {
    const parts: string[] = [];
    if (typeLabel) parts.push(typeLabel);
    return [...parts, ...form.amenities].join(' · ');
  }, [typeLabel, form.amenities]);

  const currentStepId: StepId = STEPS[step]?.id ?? 'details';

  const validateStep = useCallback(
    (current: number): boolean => {
      if (current === 0) {
        if (!form.name.trim()) {
          showToast(t('admin.wizardNameRequired'), 'warning');
          return false;
        }
        if (!form.accommodationType) {
          showToast(t('admin.wizardAccommodationTypeRequired'), 'warning');
          return false;
        }
        return true;
      }
      if (current === 2) {
        if (parseFloat(form.basePrice) <= 0 || Number.isNaN(parseFloat(form.basePrice))) {
          showToast(t('admin.wizardBasePriceRequired'), 'warning');
          return false;
        }
        return true;
      }
      // Step 1 (amenities) and step 3 (photos) have no required gates.
      return true;
    },
    [form, showToast, t],
  );

  const goNext = useCallback(() => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, [step, validateStep]);

  const goBack = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const handleClose = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [submitting, onClose]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    // The Next-step gates (validateStep) already guarantee name/type/price are
    // valid by the time the user reaches the final step, so no re-validation
    // is needed here — the fields are not editable on later steps.
    setSubmitting(true);
    const price = parseFloat(form.basePrice);
    try {
      // 1) Camp — the listing record. Description is kept as camp notes.
      const campResult = (await saveCampMutation.mutateAsync({
        name: form.name.trim(),
        location: '',
        status: 'active',
        notes: form.description.trim() || undefined,
      })) as { id?: string };
      const campId = campResult?.id ?? '';

      // 2) Product (room type) associated with the new camp. The first photo
      //    (uploaded or URL) becomes the listing cover image.
      const productResult = (await saveProductMutation.mutateAsync({
        name: form.name.trim(),
        capacity: parseInt(form.capacity, 10) || 1,
        basePrice: price,
        description: form.description.trim() || undefined,
        shortDescription: shortDescription || undefined,
        imageUrl: form.photos[0]?.url || undefined,
        campIds: [campId],
      })) as { id?: string };
      const productId = productResult?.id ?? '';

      // 3) Seasonal rate plan for the new product.
      await saveRatePlanMutation.mutateAsync({
        productId,
        name: form.ratePlanName.trim() || 'Standard',
        pricePerNight: price,
        season: form.season,
        minStay: parseInt(form.minStay, 10) || 1,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        isActive: 1,
      });

      showToast(t('admin.wizardSubmitSuccess'), 'success');
      onCreated();
      onClose();
    } catch {
      showToast(t('admin.wizardSubmitError'), 'error');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, form, shortDescription, saveCampMutation, saveProductMutation, saveRatePlanMutation, showToast, t, onCreated, onClose]);

  const isLastStep = step === STEPS.length - 1;

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title={t('admin.newListing')}
      size="full"
      closeOnOverlay={!submitting}
      closeOnEsc={!submitting}
      showCloseButton={!submitting}
    >
      <ModalBody>
        <div data-testid="listing-wizard" className="space-y-5">
          {/* Stepper header */}
          <ol className="flex items-center gap-2" data-testid="wizard-steps">
            {STEPS.map((s, i) => {
              const isActive = i === step;
              const isDone = i < step;
              return (
                <li key={s.id} className="flex flex-1 items-center gap-2">
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-200',
                      isDone && 'bg-success-600 text-white',
                      isActive && 'bg-brand-600 text-white ring-4 ring-brand-100',
                      !isDone && !isActive && 'bg-gray-200 text-gray-500',
                    )}
                  >
                    {isDone ? (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span
                    className={cn(
                      'hidden sm:block text-sm font-medium',
                      isActive ? 'text-gray-900' : isDone ? 'text-gray-600' : 'text-gray-400',
                    )}
                  >
                    {t(s.key)}
                  </span>
                  {i < STEPS.length - 1 && <div className="h-px flex-1 bg-gray-200" aria-hidden="true" />}
                </li>
              );
            })}
          </ol>

          {/* Step content + live preview */}
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              {currentStepId === 'details' && (
                <div data-testid="wizard-step-details" className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-800">{t('admin.wizardDetailsTitle')}</h3>
                  <Input
                    label={t('admin.wizardName')}
                    type="text"
                    value={form.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder={t('admin.wizardNamePlaceholder')}
                  />
                  <Select
                    label={t('admin.wizardAccommodationType')}
                    options={accommodationTypeOptions}
                    value={form.accommodationType}
                    onChange={(e) => updateField('accommodationType', e.target.value)}
                    placeholder={t('admin.wizardAccommodationTypePlaceholder')}
                  />
                  <Input
                    label={t('admin.wizardCapacity')}
                    type="number"
                    value={form.capacity}
                    onChange={(e) => updateField('capacity', e.target.value)}
                    placeholder={t('admin.wizardCapacityPlaceholder')}
                    min="0"
                  />
                  <div>
                    <label htmlFor="wizard-description" className="block text-sm font-medium text-gray-700 mb-1">
                      {t('admin.wizardDescription')}
                    </label>
                    <textarea
                      id="wizard-description"
                      value={form.description}
                      onChange={(e) => updateField('description', e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:border-brand-500 focus:ring-brand-500"
                      rows={4}
                      placeholder={t('admin.wizardDescriptionPlaceholder')}
                    />
                  </div>
                </div>
              )}

              {currentStepId === 'amenities' && (
                <div data-testid="wizard-step-amenities" className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-800">{t('admin.wizardAmenitiesTitle')}</h3>
                  <p className="text-sm text-gray-500">{t('admin.wizardAmenitiesHint')}</p>
                  <div className="flex flex-wrap gap-2">
                    {AMENITY_OPTIONS.map((amenity) => {
                      const selected = form.amenities.includes(amenity);
                      return (
                        <button
                          key={amenity}
                          type="button"
                          aria-pressed={selected}
                          aria-label={`${t('admin.wizardAmenitiesToggleLabel')}: ${amenity}`}
                          onClick={() => toggleAmenity(amenity)}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-200',
                            selected
                              ? 'border-brand-600 bg-brand-600 text-white'
                              : 'border-gray-300 bg-white text-gray-700 hover:border-brand-500 hover:text-brand-700',
                          )}
                        >
                          {selected && (
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          {amenity}
                        </button>
                      );
                    })}
                  </div>
                  {form.amenities.length === 0 && (
                    <p className="text-sm text-gray-400" data-testid="wizard-amenities-empty">
                      {t('admin.wizardAmenitiesEmpty')}
                    </p>
                  )}
                </div>
              )}

              {currentStepId === 'pricing' && (
                <div data-testid="wizard-step-pricing" className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-800">{t('admin.wizardPricingTitle')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label={t('admin.wizardBasePrice')}
                      type="number"
                      value={form.basePrice}
                      onChange={(e) => updateField('basePrice', e.target.value)}
                      placeholder={t('admin.wizardBasePricePlaceholder')}
                      min="0"
                      step="0.01"
                    />
                    <Input
                      label={t('admin.wizardRatePlanName')}
                      type="text"
                      value={form.ratePlanName}
                      onChange={(e) => updateField('ratePlanName', e.target.value)}
                      placeholder={t('admin.wizardRatePlanNamePlaceholder')}
                    />
                    <Select
                      label={t('admin.wizardSeason')}
                      options={seasonOptions}
                      value={form.season}
                      onChange={(e) => updateField('season', e.target.value)}
                    />
                    <Input
                      label={t('admin.wizardMinStay')}
                      type="number"
                      value={form.minStay}
                      onChange={(e) => updateField('minStay', e.target.value)}
                      min="1"
                    />
                    <Input
                      label={t('admin.wizardStartDate')}
                      type="date"
                      value={form.startDate}
                      onChange={(e) => updateField('startDate', e.target.value)}
                    />
                    <Input
                      label={t('admin.wizardEndDate')}
                      type="date"
                      value={form.endDate}
                      onChange={(e) => updateField('endDate', e.target.value)}
                    />
                  </div>
                </div>
              )}

              {currentStepId === 'photos' && (
                <div data-testid="wizard-step-photos" className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-800">{t('admin.wizardPhotosTitle')}</h3>
                  <p className="text-sm text-gray-500">{t('admin.wizardPhotosHint')}</p>
                  <PhotosStep photos={form.photos} onChange={(photos) => updateField('photos', photos)} />
                </div>
              )}
            </div>

            {/* Live preview */}
            <div className="lg:col-span-2">
              <div className="rounded-xl border border-gray-200 bg-white p-4" data-testid="wizard-preview">
                <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  {t('admin.wizardPreviewTitle')}
                </h4>
                {form.photos[0] ? (
                  <img
                    src={form.photos[0].url}
                    alt={form.name || t('admin.wizardPreviewNoPhoto')}
                    className="mb-3 h-32 w-full rounded-lg object-cover"
                  />
                ) : (
                  <div className="mb-3 flex h-32 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-400">
                    {t('admin.wizardPreviewNoPhoto')}
                  </div>
                )}
                <p className="text-base font-bold text-gray-900">{form.name || '—'}</p>
                <dl className="mt-2 space-y-1 text-sm text-gray-600">
                  <div className="flex justify-between gap-2">
                    <dt>{t('admin.wizardPreviewType')}</dt>
                    <dd className="text-right text-gray-900">{typeLabel || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>{t('admin.wizardPreviewCapacity')}</dt>
                    <dd className="text-right text-gray-900">{form.capacity || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>{t('admin.wizardPreviewPrice')}</dt>
                    <dd className="text-right font-semibold text-brand-700">
                      {formatCurrency(parseFloat(form.basePrice) || 0)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>{t('admin.wizardPreviewAmenities')}</dt>
                    <dd className="max-w-[60%] text-right text-gray-900">
                      {form.amenities.length > 0 ? form.amenities.join(', ') : '—'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <div className="flex w-full items-center justify-between gap-3">
          <Button variant="ghost" size="md" onClick={handleClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="md" onClick={goBack} disabled={step === 0 || submitting}>
              {t('admin.wizardBack')}
            </Button>
            {isLastStep ? (
              <Button
                variant="success"
                size="md"
                onClick={handleSubmit}
                loading={submitting}
                disabled={submitting}
                leftIcon={
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                }
              >
                {submitting ? t('admin.wizardCreating') : t('admin.wizardCreate')}
              </Button>
            ) : (
              <Button variant="primary" size="md" onClick={goNext} disabled={submitting}>
                {t('admin.wizardNext')}
              </Button>
            )}
          </div>
        </div>
      </ModalFooter>
    </Modal>
  );
}
