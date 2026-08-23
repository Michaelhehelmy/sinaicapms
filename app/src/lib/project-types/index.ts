/**
 * Project type schemas — the "what kind of thing is this project" layer of the
 * unified business/project schema.
 *
 * A project row (projects table) holds the shared core columns; everything
 * type-specific lives in `project_meta` key-value rows. Each schema declares:
 *   - which core columns the form shows (`coreFields`)
 *   - which meta keys exist, their input shape, and their labels (`metaFields`)
 *
 * The admin DynamicForm renders directly from these schemas, and future
 * panels (filters, detail views) can reuse the same registry without any
 * per-type hardcoding.
 */

/** Input widget used to render a meta field. */
export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'tags'
  | 'image-gallery'
  | 'json';

/** One custom-field definition rendered from (and persisted to) project_meta. */
export interface MetaFieldDef {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  helpText?: string;
  /** Multi-value fields (tags, image-gallery). */
  multi?: boolean;
  /** Allowed values for the `select` type. */
  options?: string[];
  required?: boolean;
  /** Bounds for the `number` type (passed to the underlying input). */
  min?: number;
  max?: number;
}

/** Schema for one project TYPE (camp, supermarket, transportation, …). */
export interface ProjectTypeSchema {
  type: string;
  label: string;
  /** Emoji or icon name shown next to the type in pickers/tables. */
  icon: string;
  description: string;
  /** Which shared core columns to show in the form (see CORE_FIELD_DEFS). */
  coreFields: string[];
  metaFields: MetaFieldDef[];
}

/** What the tenant IS at the business level (drives tenant-level meta). */
export type BusinessType = 'camp' | 'supermarket' | 'transportation' | 'restaurant' | 'hotel' | 'custom';

/** Schema for one business TYPE (tenant identity + business-level meta). */
export interface BusinessTypeSchema {
  type: BusinessType;
  label: string;
  icon: string;
  description: string;
  /** Which project types this business can own. */
  projectTypes: string[];
  metaFields: MetaFieldDef[];
}

import { campProjectType } from './camp';
import { supermarketProjectType } from './supermarket';
import { transportationProjectType } from './transportation';
import { restaurantProjectType } from './restaurant';

/**
 * Registry of every project type schema, keyed by its `type` string.
 * Adding a new vertical = add a schema file + one entry here.
 */
export const PROJECT_TYPES: Record<string, ProjectTypeSchema> = {
  camp: campProjectType,
  supermarket: supermarketProjectType,
  transportation: transportationProjectType,
  restaurant: restaurantProjectType,
};

export { campProjectType } from './camp';
export { supermarketProjectType } from './supermarket';
export { transportationProjectType } from './transportation';
export { restaurantProjectType } from './restaurant';

/** Look up a project type schema with a safe fallback for unknown types. */
export function getProjectType(type: string | null | undefined): ProjectTypeSchema {
  if (type && PROJECT_TYPES[type]) return PROJECT_TYPES[type];
  // Unknown/custom types still render: core fields only, no meta fields.
  return {
    type: type || 'custom',
    label: type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Custom',
    icon: '📦',
    description: 'Custom project type.',
    coreFields: ['name', 'location', 'description', 'status'],
    metaFields: [],
  };
}

/** Deterministic display order for project-type pickers (registry order). */
export const PROJECT_TYPE_ORDER: string[] = ['camp', 'supermarket', 'transportation', 'restaurant'];

// ─── Meta value serialization ────────────────────────────────────────
// project_meta.meta_value is a TEXT column and the backend Zod schema enforces
// `meta_value: z.string().min(1)` — so EVERY persisted value is a string.
// These helpers are the single translation layer between the rich in-form
// values (string[] for tags, number, raw JSON text) and their wire form.

/** Fields whose in-form value is a string[]. */
const MULTI_VALUE_TYPES: ReadonlySet<FieldType> = new Set(['tags', 'image-gallery']);

/**
 * Encode an in-form meta value to its wire string.
 * Returns null when the value is empty — callers must treat null as
 * "delete the stored row" (the backend rejects empty strings).
 */
export function encodeMetaValue(field: MetaFieldDef, value: unknown): string | null {
  if (MULTI_VALUE_TYPES.has(field.type)) {
    const list = Array.isArray(value)
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? value.split(',').map((s) => s.trim()).filter(Boolean) // legacy comma state
        : [];
    if (list.length === 0) return null;
    return JSON.stringify(list);
  }
  if (value === undefined || value === null) return null;
  const s = String(value);
  return s.trim() === '' ? null : s;
}

/**
 * Decode a stored wire string back into the widget's native value shape
 * (inverse of encodeMetaValue; tolerant of legacy comma-separated rows).
 */
export function decodeMetaValue(field: MetaFieldDef, raw: unknown): unknown {
  if (raw === undefined || raw === null) return MULTI_VALUE_TYPES.has(field.type) ? [] : '';
  const s = String(raw);
  if (!MULTI_VALUE_TYPES.has(field.type)) return s;
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* fall through to legacy parsing */
  }
  return s.split(',').map((v) => v.trim()).filter(Boolean);
}

// ─── Meta write-op diffing ───────────────────────────────────────────

export interface MetaRow {
  id: number;
  metaKey: string;
  metaValue: string;
}

export interface MetaWriteOps {
  /** Rows to create via POST (key had no row yet). */
  creates: { key: string; value: string }[];
  /** Rows to update via PUT /meta/:id (keeps id + sort_order stable). */
  updates: { id: number; value: string }[];
  /** Row ids to DELETE (field cleared). */
  deletes: number[];
}

/**
 * Diff the currently-loaded meta rows against the next form values for ONE
 * schema's metaFields. Only fields present in `fields` participate — values
 * belonging to other schemas (or core-owned keys like `notes`) are untouched,
 * so switching a project's type never silently rewrites foreign data.
 *
 * @param rows      current rows from GET /projects/:id/meta
 * @param next      next in-form values keyed by field.key (native shapes)
 * @param fields    the schema fields being edited
 * @param exclude   keys owned elsewhere (e.g. core-form `notes`) — never diffed
 */
export function buildMetaOps(
  rows: MetaRow[],
  next: Record<string, unknown>,
  fields: MetaFieldDef[],
  exclude: string[] = [],
): MetaWriteOps {
  const ops: MetaWriteOps = { creates: [], updates: [], deletes: [] };
  const skip = new Set(exclude);
  const byKey = new Map(rows.map((r) => [r.metaKey, r]));

  for (const field of fields) {
    if (skip.has(field.key)) continue;
    const encoded = encodeMetaValue(field, next[field.key]);
    const existing = byKey.get(field.key);

    if (encoded === null) {
      if (existing) ops.deletes.push(existing.id);
      continue;
    }
    if (!existing) {
      ops.creates.push({ key: field.key, value: encoded });
    } else if (existing.metaValue !== encoded) {
      ops.updates.push({ id: existing.id, value: encoded });
    }
    // unchanged → no op
  }

  return ops;
}

/** True when the diff produced no writes at all. */
export function isMetaOpsEmpty(ops: MetaWriteOps): boolean {
  return ops.creates.length === 0 && ops.updates.length === 0 && ops.deletes.length === 0;
}
