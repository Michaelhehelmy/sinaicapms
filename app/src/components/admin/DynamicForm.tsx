import React, { useId } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type {
  BusinessTypeSchema,
  MetaFieldDef,
  ProjectTypeSchema,
} from '@/lib/project-types';

/**
 * Schema-driven admin form.
 *
 * Renders two sections from a ProjectTypeSchema or BusinessTypeSchema:
 *   1. Core fields   — shared project columns (name, location, dates…),
 *                      selected by `schema.coreFields`.
 *   2. Meta fields   — vertical-specific custom fields rendered from
 *                      `schema.metaFields` and persisted as meta key-value rows.
 *
 * Fully controlled: the parent owns `values`/`metaValues` state and receives
 * every edit through `onChange(field, value)` / `onMetaChange(key, value)`.
 */

export interface DynamicFormProps {
  /** A project-type or business-type schema describing what to render. */
  schema: ProjectTypeSchema | BusinessTypeSchema;
  /** Current core-field values, keyed by core column name (e.g. `start_date`). */
  values: Record<string, any>;
  /** Current meta values, keyed by meta field key. */
  metaValues: Record<string, any>;
  /** A core-field value changed. */
  onChange: (field: string, value: any) => void;
  /** A meta-field value changed. */
  onMetaChange: (key: string, value: any) => void;
  /**
   * Validation errors keyed by field/meta key. Meta errors may additionally be
   * prefixed with `meta.` (lookup order: `meta.<key>` then `<key>`).
   */
  errors?: Record<string, string>;
  disabled?: boolean;
  /**
   * Which sections to render: the full form (`'all'`, default), only core
   * columns, or only the meta/custom-fields section. Panels that already own
   * their own core-field markup can embed just the meta section.
   */
  fields?: 'all' | 'core' | 'meta';
  /** Meta keys to skip entirely (e.g. `notes` when a panel's core form owns it). */
  excludeMetaKeys?: string[];
}

// ─── Core field catalogue ──────────────────────────────────────
/** Known shared columns a schema can reference from `coreFields`. */
interface CoreFieldDef {
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select';
  placeholder?: string;
  required?: boolean;
  min?: number;
  /** Full-width row in the responsive grid. */
  fullWidth?: boolean;
  options?: { value: string; label: string }[];
}

const CORE_FIELD_DEFS: Record<string, CoreFieldDef> = {
  name: {
    label: 'Name',
    type: 'text',
    required: true,
    placeholder: 'Project name',
  },
  location: {
    label: 'Location',
    type: 'text',
    placeholder: 'Paste Google Maps link or type address',
  },
  start_date: { label: 'Start Date', type: 'date' },
  end_date: { label: 'End Date', type: 'date' },
  capacity: { label: 'Capacity', type: 'number', min: 0, placeholder: '0' },
  description: {
    label: 'Description',
    type: 'textarea',
    fullWidth: true,
    placeholder: 'Describe this project…',
  },
  status: {
    label: 'Status',
    type: 'select',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' },
      { value: 'planning', label: 'Planning' },
      { value: 'completed', label: 'Completed' },
    ],
  },
};

const STATUS_OPTIONS = CORE_FIELD_DEFS.status.options ?? [];

// ─── Small helpers ─────────────────────────────────────────────
/** Tags values are arrays; tolerate legacy comma-separated strings. */
function tagsToInputValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  return typeof value === 'string' ? value : '';
}

function splitTags(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const tag = part.trim();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

/** Image gallery values are arrays of URLs, one entry per line in the editor. */
function galleryToInputValue(value: unknown): string {
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string').join('\n');
  return typeof value === 'string' ? value : '';
}

function splitGallery(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function jsonToInputValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null || value === '') return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    /* v8 ignore next */
    return String(value);
  }
}

export function isValidJson(raw: string): boolean {
  if (!raw.trim()) return true; // empty = unset
  try {
    JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
}

// ─── Field chrome (label + required marker + error/help text) ──
function FieldShell({
  id,
  label,
  required,
  error,
  helpText,
  children,
  fullWidth,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  helpText?: string;
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div className={cn('w-full', fullWidth && 'md:col-span-2')}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && (
          <span className="text-error-500 ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-error-500 mt-1">
          {error}
        </p>
      ) : helpText ? (
        <p id={`${id}-help`} className="text-xs text-gray-400 mt-1">
          {helpText}
        </p>
      ) : null}
    </div>
  );
}

// ─── Shared control classes (matches admin panel styling) ─────
const CONTROL_CLASSES =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:border-brand-500 focus:ring-brand-500 disabled:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60';

export default function DynamicForm({
  schema,
  values,
  metaValues,
  onChange,
  onMetaChange,
  errors = {},
  disabled = false,
  fields: sections = 'all',
  excludeMetaKeys = [],
}: DynamicFormProps) {
  const uid = useId();
  // ProjectTypeSchema carries core columns; BusinessTypeSchema is meta-only
  // (tenant identity fields live in tenant_meta, not on a project row).
  const coreFields =
    sections === 'meta' ? [] : 'coreFields' in schema ? schema.coreFields : [];
  const visibleMetaFields =
    sections === 'core' ? [] : schema.metaFields.filter((f) => !excludeMetaKeys.includes(f.key));
  const hasCore = coreFields.length > 0;
  const hasMeta = visibleMetaFields.length > 0;

  const errFor = (key: string): string | undefined => errors[`meta.${key}`] ?? errors[key];

  // ── Core field renderer ──────────────────────────────────────
  const renderCoreField = (fieldKey: string) => {
    const def = CORE_FIELD_DEFS[fieldKey];
    /* v8 ignore next — schemas are static; unknown keys are a dev-time bug */
    if (!def) return null;

    const id = `${uid}-core-${fieldKey}`;
    const error = errors[fieldKey];
    const value = values[fieldKey] ?? '';
    const shellProps = {
      id,
      label: def.label,
      required: def.required,
      error,
      fullWidth: def.fullWidth,
    };

    switch (def.type) {
      case 'textarea':
        return (
          <FieldShell key={id} {...shellProps}>
            <textarea
              id={id}
              value={String(value)}
              onChange={(e) => onChange(fieldKey, e.target.value)}
              disabled={disabled}
              aria-required={def.required || undefined}
              aria-invalid={!!error || undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              rows={3}
              placeholder={def.placeholder}
              className={CONTROL_CLASSES}
              data-testid={`form-field-${fieldKey}`}
            />
          </FieldShell>
        );
      case 'select':
        return (
          <FieldShell key={id} {...shellProps}>
            <Select
              id={id}
              options={def.options ?? STATUS_OPTIONS}
              value={String(value)}
              onChange={(e) => onChange(fieldKey, e.target.value)}
              disabled={disabled}
              placeholder="Select status"
              data-testid={`form-field-${fieldKey}`}
            />
          </FieldShell>
        );
      case 'date':
        return (
          <FieldShell key={id} {...shellProps}>
            <input
              id={id}
              type="date"
              value={String(value)}
              onChange={(e) => onChange(fieldKey, e.target.value)}
              disabled={disabled}
              aria-required={def.required || undefined}
              aria-invalid={!!error || undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              className={CONTROL_CLASSES}
              data-testid={`form-field-${fieldKey}`}
            />
          </FieldShell>
        );
      // NOTE: label/error/helpText chrome is owned by <FieldShell>, so the
      // control primitives below never receive those props (they would render
      // a second, duplicate error node with a colliding id).
      default:
        return (
          <FieldShell key={id} {...shellProps}>
            <Input
              id={id}
              type={def.type}
              value={String(value)}
              onChange={(e) =>
                onChange(
                  fieldKey,
                  def.type === 'number'
                    ? e.target.value === ''
                      ? ''
                      : Number(e.target.value)
                    : e.target.value,
                )
              }
              disabled={disabled}
              required={def.required}
              min={def.min !== undefined ? String(def.min) : undefined}
              placeholder={def.placeholder}
              aria-required={def.required || undefined}
              aria-invalid={!!error || undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              data-testid={`form-field-${fieldKey}`}
            />
          </FieldShell>
        );
    }
  };

  // ── Meta field renderer ──────────────────────────────────────
  const renderMetaField = (field: MetaFieldDef) => {
    const id = `${uid}-meta-${field.key}`;
    const error = errFor(field.key);
    const raw = metaValues[field.key];

    const describedBy =
      error ? `${id}-error` : field.helpText ? `${id}-help` : undefined;
    const shellProps = {
      id,
      label: field.label,
      required: field.required,
      error,
      helpText: field.helpText,
    };

    switch (field.type) {
      case 'textarea':
        return (
          <FieldShell key={id} {...shellProps} fullWidth>
            <textarea
              id={id}
              value={typeof raw === 'string' ? raw : ''}
              onChange={(e) => onMetaChange(field.key, e.target.value)}
              disabled={disabled}
              aria-required={field.required || undefined}
              aria-invalid={!!error || undefined}
              aria-describedby={describedBy}
              rows={3}
              placeholder={field.placeholder}
              className={CONTROL_CLASSES}
              data-testid={`form-meta-${field.key}`}
            />
          </FieldShell>
        );

      case 'number':
        return (
          <FieldShell key={id} {...shellProps}>
            <input
              id={id}
              type="number"
              value={raw === undefined || raw === null ? '' : String(raw)}
              onChange={(e) =>
                onMetaChange(field.key, e.target.value === '' ? '' : Number(e.target.value))
              }
              disabled={disabled}
              aria-required={field.required || undefined}
              aria-invalid={!!error || undefined}
              aria-describedby={describedBy}
              min={field.min !== undefined ? String(field.min) : undefined}
              max={field.max !== undefined ? String(field.max) : undefined}
              step="any"
              placeholder={field.placeholder}
              className={CONTROL_CLASSES}
              data-testid={`form-meta-${field.key}`}
            />
          </FieldShell>
        );

      case 'date':
        return (
          <FieldShell key={id} {...shellProps}>
            <input
              id={id}
              type="date"
              value={typeof raw === 'string' ? raw : ''}
              onChange={(e) => onMetaChange(field.key, e.target.value)}
              disabled={disabled}
              aria-required={field.required || undefined}
              aria-invalid={!!error || undefined}
              aria-describedby={describedBy}
              className={CONTROL_CLASSES}
              data-testid={`form-meta-${field.key}`}
            />
          </FieldShell>
        );

      case 'select':
        return (
          <FieldShell key={id} {...shellProps}>
            <Select
              id={id}
              options={(field.options ?? []).map((opt) => ({ value: opt, label: opt }))}
              value={typeof raw === 'string' ? raw : ''}
              onChange={(e) => onMetaChange(field.key, e.target.value)}
              disabled={disabled}
              placeholder={field.placeholder ?? 'Select an option'}
              data-testid={`form-meta-${field.key}`}
            />
          </FieldShell>
        );

      // Multi-value editors below span the full row for breathing room.
      case 'tags':
        return (
          <FieldShell
            key={id}
            {...shellProps}
            fullWidth
            helpText={
              field.helpText ?? 'Comma-separated values.'
            }
          >
            <Input
              id={id}
              type="text"
              value={tagsToInputValue(raw)}
              onChange={(e) => onMetaChange(field.key, splitTags(e.target.value))}
              disabled={disabled}
              aria-required={field.required || undefined}
              aria-invalid={!!error || undefined}
              aria-describedby={describedBy}
              placeholder={field.placeholder}
              data-testid={`form-meta-${field.key}`}
            />
          </FieldShell>
        );

      case 'image-gallery':
        return (
          <FieldShell
            key={id}
            {...shellProps}
            fullWidth
            helpText={field.helpText ?? 'One image URL per line.'}
          >
            <textarea
              id={id}
              value={galleryToInputValue(raw)}
              onChange={(e) => onMetaChange(field.key, splitGallery(e.target.value))}
              disabled={disabled}
              aria-required={field.required || undefined}
              aria-invalid={!!error || undefined}
              aria-describedby={describedBy}
              rows={3}
              placeholder={'https://example.com/photo-1.jpg\nhttps://example.com/photo-2.jpg'}
              className={cn(CONTROL_CLASSES, 'font-mono')}
              data-testid={`form-meta-${field.key}`}
            />
          </FieldShell>
        );

      case 'json': {
        const rawJson = typeof raw === 'string' ? raw : '';
        const jsonError = error ?? (isValidJson(rawJson) ? undefined : 'Invalid JSON');
        const jsonDescribedBy = jsonError ? `${id}-error` : field.helpText ? `${id}-help` : undefined;
        return (
          <FieldShell key={id} {...shellProps} fullWidth error={jsonError}>
            <textarea
              id={id}
              value={jsonToInputValue(raw)}
              onChange={(e) => onMetaChange(field.key, e.target.value)}
              disabled={disabled}
              aria-required={field.required || undefined}
              aria-invalid={!!jsonError || undefined}
              aria-describedby={jsonDescribedBy}
              rows={4}
              placeholder={'{ "key": "value" }'}
              className={cn(CONTROL_CLASSES, 'font-mono')}
              spellCheck={false}
              data-testid={`form-meta-${field.key}`}
            />
          </FieldShell>
        );
      }

      case 'text':
      default:
        return (
          <FieldShell key={id} {...shellProps}>
            <Input
              id={id}
              type="text"
              value={typeof raw === 'string' ? raw : ''}
              onChange={(e) => onMetaChange(field.key, e.target.value)}
              disabled={disabled}
              aria-required={field.required || undefined}
              aria-invalid={!!error || undefined}
              aria-describedby={describedBy}
              placeholder={field.placeholder}
              data-testid={`form-meta-${field.key}`}
            />
          </FieldShell>
        );
    }
  };

  return (
    <div data-testid="dynamic-form">
      {hasCore && (
        <section aria-label={`${schema.label} details`} className="mb-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 uppercase tracking-wide mb-3">
            <span aria-hidden="true">{schema.icon}</span>
            {schema.label} Details
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {coreFields.map(renderCoreField)}
          </div>
        </section>
      )}

      {hasMeta && (
        <section aria-label={`${schema.label} custom fields`}>
          <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide mb-3">
            Custom Fields
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleMetaFields.map(renderMetaField)}
          </div>
        </section>
      )}

      {!hasCore && !hasMeta && (
        <p className="text-sm text-gray-500">No editable fields for “{schema.label}”.</p>
      )}
    </div>
  );
}
