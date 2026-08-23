import type { BusinessType, BusinessTypeSchema, MetaFieldDef } from '@/lib/project-types';

/**
 * Business type schemas — the "what the tenant IS" layer of the unified
 * business/project schema. A tenant picks one business type at setup; it
 * controls which project types the tenant can own and which business-level
 * meta fields (contact info, hours, fleet size…) are editable.
 *
 * Business meta is stored in `tenant_meta` key-value rows using the same
 * MetaFieldDef shapes as project meta.
 */

// ─── Shared contact field builders ─────────────────────────────
// Every business type exposes phone/email/website; most add opening_hours.
// Built via helpers so labels/help stay consistent across types.

const PHONE: MetaFieldDef = {
  key: 'phone',
  label: 'Phone',
  type: 'text',
  placeholder: '+20 …',
};

const EMAIL: MetaFieldDef = {
  key: 'email',
  label: 'Email',
  type: 'text',
  placeholder: 'contact@example.com',
};

const WEBSITE: MetaFieldDef = {
  key: 'website',
  label: 'Website',
  type: 'text',
  placeholder: 'https://…',
};

function withContact(extra: MetaFieldDef[]): MetaFieldDef[] {
  return [PHONE, EMAIL, WEBSITE, ...extra];
}

const OPENING_HOURS: MetaFieldDef = {
  key: 'opening_hours',
  label: 'Opening Hours',
  type: 'text',
  placeholder: 'e.g., Daily 08:00–22:00',
};

/**
 * Registry of every business type schema, keyed by its BusinessType string.
 */
export const BUSINESS_TYPES: Record<BusinessType, BusinessTypeSchema> = {
  camp: {
    type: 'camp',
    label: 'Camp',
    icon: '🏕️',
    description: 'Accommodation business offering camps, rooms, and stays.',
    projectTypes: ['camp'],
    metaFields: withContact([OPENING_HOURS]),
  },
  supermarket: {
    type: 'supermarket',
    label: 'Supermarket',
    icon: '🛒',
    description: 'Retail grocery store selling products on-site or for delivery.',
    projectTypes: ['supermarket'],
    metaFields: withContact([
      OPENING_HOURS,
      {
        key: 'delivery_area',
        label: 'Delivery Area',
        type: 'text',
        placeholder: 'e.g., Dahab city center + 10 km',
      },
    ]),
  },
  transportation: {
    type: 'transportation',
    label: 'Transportation',
    icon: '🚌',
    description: 'Transport operator moving passengers between destinations.',
    projectTypes: ['transportation'],
    metaFields: withContact([
      {
        key: 'fleet_size',
        label: 'Fleet Size',
        type: 'number',
        placeholder: '0',
        min: 0,
        helpText: 'Number of vehicles in the fleet.',
      },
    ]),
  },
  restaurant: {
    type: 'restaurant',
    label: 'Restaurant',
    icon: '🍽️',
    description: 'Dining venue serving guests on-site or for takeaway.',
    projectTypes: ['restaurant'],
    metaFields: withContact([
      OPENING_HOURS,
      {
        key: 'cuisine_type',
        label: 'Cuisine Types',
        type: 'tags',
        multi: true,
        placeholder: 'Bedouin, Seafood, Grill',
      },
    ]),
  },
  hotel: {
    type: 'hotel',
    label: 'Hotel',
    icon: '🏨',
    description: 'Hotel property with rooms and guest services.',
    projectTypes: ['hotel'],
    metaFields: withContact([
      {
        key: 'star_rating',
        label: 'Star Rating',
        type: 'number',
        placeholder: '1–5',
        min: 1,
        max: 5,
        helpText: 'Official star classification (1–5).',
      },
      {
        key: 'amenities',
        label: 'Amenities',
        type: 'tags',
        multi: true,
        placeholder: 'Pool, Spa, Free Wi-Fi',
      },
    ]),
  },
  custom: {
    type: 'custom',
    label: 'Custom',
    icon: '📦',
    description: 'Fully custom business — define your own structure later.',
    projectTypes: [],
    metaFields: withContact([]),
  },
};

/** Deterministic iteration order for pickers (custom last as the fallback). */
export const BUSINESS_TYPE_ORDER: BusinessType[] = [
  'camp',
  'supermarket',
  'transportation',
  'restaurant',
  'hotel',
  'custom',
];

/** Look up a business type schema with a safe fallback to `custom`. */
export function getBusinessType(type: string | null | undefined): BusinessTypeSchema {
  if (type && BUSINESS_TYPES[type as BusinessType]) return BUSINESS_TYPES[type as BusinessType];
  return BUSINESS_TYPES.custom;
}
