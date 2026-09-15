import React, { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import * as api from '@/lib/api';
import type { components } from '@/lib/api-types';
import { escHtml } from '@/lib/utils';

type Schemas = components['schemas'];
import { useToast } from '@/components/ui/Toast';
import { Card, CardHeader, CardBody, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  IconSupply,
  IconProducts,
  IconRooms,
  IconRatePlans,
  IconMeals,
  IconMenu,
  IconStaff,
  IconPos,
} from '@/components/ui/icons';

/* ------------------------------------------------------------------ */
/*  Types & manifest parsing                                           */
/* ------------------------------------------------------------------ */

interface ImportCounts {
  products: number;
  rooms: number;
  ratePlans: number;
  mealCategories: number;
  meals: number;
  posUsers: number;
}

export interface ImportPreview {
  counts: ImportCounts;
  /** Display name resolved from `identity.name` (or `tenant.name`) — empty when absent. */
  name: string;
  /** Business type from `identity.type` (camp / supermarket / transportation / other). */
  type: string;
  hasIdentity: boolean;
  totalItems: number;
}

export type ParseManifestResult =
  | { ok: true; preview: ImportPreview; manifest: Schemas['TenantImportRequest'] }
  | { ok: false; error: string };

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asObject = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const nonEmptyString = (v: unknown): string => (typeof v === 'string' && v.trim() !== '' ? v.trim() : '');

const countRows = [
  { key: 'products', label: 'Products', icon: IconProducts, testId: 'import-count-products' },
  { key: 'rooms', label: 'Rooms', icon: IconRooms, testId: 'import-count-rooms' },
  { key: 'ratePlans', label: 'Rate plans', icon: IconRatePlans, testId: 'import-count-rateplans' },
  { key: 'mealCategories', label: 'Meal categories', icon: IconMeals, testId: 'import-count-mealcategories' },
  { key: 'meals', label: 'Meals', icon: IconMenu, testId: 'import-count-meals' },
  { key: 'posUsers', label: 'POS users', icon: IconStaff, testId: 'import-count-posusers' },
] as const;

/**
 * Client-side manifest parser + light validator. The manifest may be a
 * tenant-scoped data bundle (auth tenant inferred) or a full provisioning
 * manifest (`identity` block → brand-new tenant, super_admin only).
 */
export function parseManifest(raw: string): ParseManifestResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Invalid JSON — ${detail}` };
  }

  const obj = asObject(parsed);
  if (!obj) {
    return { ok: false, error: 'Manifest must be a single JSON object.' };
  }

  const products = asArray(obj.products);
  const rooms = asArray(obj.rooms);
  const ratePlans = asArray(obj.ratePlans);
  const posUsers = asArray(obj.posUsers);
  const menu = asObject(obj.menu);
  const mealCategories = menu ? asArray(menu.categories) : [];
  const meals = menu ? asArray(menu.meals) : [];
  const identity = asObject(obj.identity);

  const counts: ImportCounts = {
    products: products.length,
    rooms: rooms.length,
    ratePlans: ratePlans.length,
    mealCategories: mealCategories.length,
    meals: meals.length,
    posUsers: posUsers.length,
  };
  const totalItems =
    counts.products +
    counts.rooms +
    counts.ratePlans +
    counts.mealCategories +
    counts.meals +
    counts.posUsers;

  if (identity) {
    const identityName = nonEmptyString(identity.name);
    const subdomain = nonEmptyString(identity.subdomain);
    if (!identityName || !subdomain) {
      return {
        ok: false,
        error: 'The identity block requires non-empty "name" and "subdomain" strings.',
      };
    }
  } else if (totalItems === 0 && obj.tenant === undefined && obj.project === undefined) {
    return {
      ok: false,
      error:
        'Manifest is empty — include an "identity" block or at least one data section (products, rooms, ratePlans, menu, posUsers).',
    };
  }

  const name = identity ? nonEmptyString(identity.name) : nonEmptyString(asObject(obj.tenant)?.name ?? '');
  const type = identity ? nonEmptyString(identity.type) : '';

  return {
    ok: true,
    preview: { counts, name, type, hasIdentity: !!identity, totalItems },
    manifest: parsed as Schemas['TenantImportRequest'],
  };
}

/* ------------------------------------------------------------------ */
/*  Panel                                                              */
/* ------------------------------------------------------------------ */

export function TenantImportPanel() {
  const { showToast } = useToast();
  const [raw, setRaw] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<Schemas['TenantImportResponse'] | null>(null);
  const manifestRef = useRef<Schemas['TenantImportRequest'] | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const applyText = (text: string) => {
    setRaw(text);
    setResult(null);
    setSubmitError(null);
    const parsed = parseManifest(text);
    if (parsed.ok) {
      setPreview(parsed.preview);
      manifestRef.current = parsed.manifest;
      setParseError(null);
    } else {
      setPreview(null);
      manifestRef.current = null;
      setParseError(parsed.error);
    }
  };

  const handleFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      applyText(text);
    };
    reader.onerror = () => setParseError('Could not read the selected file.');
    reader.readAsText(file);
  };

  const mutation = useMutation({
    mutationFn: (manifest: Schemas['TenantImportRequest']) => api.importTenantManifest(manifest),
    onSuccess: (res) => {
      setResult(res);
      const c = res.counts;
      showToast(
        `Import complete — ${c.products} products, ${c.rooms} rooms, ${c.ratePlans} rate plans, ${c.mealCategories} meal categories, ${c.meals} meals, ${c.posUsers} POS users`,
        'success',
      );
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err);
      setSubmitError(message);
      showToast(`Import failed — ${message}`, 'error');
    },
  });

  const canImport = !!preview && !parseError && !!manifestRef.current && !mutation.isPending;

  return (
    <div data-testid="tenant-import-panel" className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Tenant Import</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Paste or upload a tenant manifest to go live in one shot — products, rooms, rate plans,
              menu, and POS users. Use the file picker for large JSON bundles.
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold text-gray-700">Manifest source</span>
            <input
              ref={fileInputRef}
              id="import-file-input"
              data-testid="import-file-input"
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = '';
                handleFile(file);
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<IconSupply size={16} />}
              onClick={() => fileInputRef.current?.click()}
            >
              Load from file
            </Button>
          </div>

          <div>
            <label
              htmlFor="import-textarea"
              className="mb-1.5 block text-sm font-semibold text-gray-700"
            >
              Manifest JSON
            </label>
            <textarea
              id="import-textarea"
              data-testid="import-textarea"
              value={raw}
              onChange={(e) => applyText(e.target.value)}
              spellCheck={false}
              placeholder='{ "identity": { "name": "…", "subdomain": "…" }, "products": [], "rooms": [], … }'
              className="min-h-[260px] w-full resize-y rounded-xl border border-warm-200 bg-warm-50/60 p-3.5 font-mono text-xs leading-relaxed text-gray-800 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
          </div>

          {parseError && (
            <div
              data-testid="import-parse-error"
              role="alert"
              className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm font-medium text-error-700"
            >
              {escHtml(parseError)}
            </div>
          )}

          {preview && !parseError && (
            <div
              data-testid="import-preview"
              className="rounded-xl border border-success-200 bg-success-50/50 p-4"
            >
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-sm font-bold text-gray-800">
                  Ready to import{preview.hasIdentity ? ' — new tenant' : ' — into current tenant'}
                </span>
                {preview.name && (
                  <span data-testid="import-preview-name" className="text-sm text-gray-700">
                    {escHtml(preview.name)}
                  </span>
                )}
                {preview.type && (
                  <span
                    data-testid="import-preview-type"
                    className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700"
                  >
                    {escHtml(preview.type)}
                  </span>
                )}
                <span className="text-sm font-semibold text-gray-600">
                  {preview.totalItems} item{preview.totalItems === 1 ? '' : 's'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {countRows.map((row) => {
                  const Icon = row.icon;
                  const value = preview.counts[row.key];
                  return (
                    <div
                      key={row.key}
                      data-testid={row.testId}
                      className="rounded-lg border border-warm-200 bg-white px-3 py-2.5"
                    >
                      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                        <Icon size={14} />
                        <span>{row.label}</span>
                      </div>
                      <div className="mt-1 text-xl font-extrabold text-gray-900">{value}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardBody>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            Without an <code className="rounded bg-warm-100 px-1 py-0.5 font-mono">identity</code> block
            the manifest imports into your tenant. Super admins can include{' '}
            <code className="rounded bg-warm-100 px-1 py-0.5 font-mono">identity</code> to provision a
            brand-new tenant.
          </p>
          <div className="flex items-center gap-3">
            {submitError && (
              <span data-testid="import-submit-error" className="text-sm font-medium text-error-600">
                {escHtml(submitError)}
              </span>
            )}
            <Button
              data-testid="import-go-live-btn"
              variant="primary"
              size="md"
              loading={mutation.isPending}
              disabled={!canImport}
              rightIcon={<IconSupply size={16} />}
              onClick={() => {
                const manifest = manifestRef.current;
                if (manifest) mutation.mutate(manifest);
              }}
            >
              Go live now
            </Button>
          </div>
        </CardFooter>
      </Card>

      {result && (
        <Card data-testid="import-result">
          <CardHeader>
            <div>
              <h3 className="text-base font-bold text-gray-900">Import complete</h3>
              <p className="mt-0.5 text-sm text-gray-500">
                The import is live — the counts below reflect what was created.
              </p>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {countRows.map((row) => {
                const Icon = row.icon;
                const value = result.counts[row.key];
                return (
                  <div
                    key={row.key}
                    data-testid={`${row.testId}-result`}
                    className="rounded-lg border border-warm-200 bg-warm-50/60 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                      <Icon size={14} />
                      <span>{row.label}</span>
                    </div>
                    <div className="mt-1 text-xl font-extrabold text-success-700">{value}</div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {!result && !preview && !parseError && (
        <Card>
          <CardBody className="text-center text-sm text-gray-500">
            Paste your manifest above or load a <code className="rounded bg-warm-100 px-1 py-0.5 font-mono">.json</code>{' '}
            file to preview exactly what will be created.
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export default TenantImportPanel;