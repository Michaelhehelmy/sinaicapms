import type { ProjectTypeSchema } from './index';

/**
 * Transportation project type — a route or service: origin/destination pair,
 * vehicle class, schedule, per-trip pricing, stops, and onboard amenities.
 */
export const transportationProjectType: ProjectTypeSchema = {
  type: 'transportation',
  label: 'Transportation',
  icon: '🚌',
  description: 'A transport route or service connecting origins and destinations.',
  coreFields: ['name', 'location', 'capacity', 'description', 'status'],
  metaFields: [
    {
      key: 'route_origin',
      label: 'Route Origin',
      type: 'text',
      placeholder: 'e.g., Cairo',
      required: true,
    },
    {
      key: 'route_destination',
      label: 'Route Destination',
      type: 'text',
      placeholder: 'e.g., Saint Catherine',
      required: true,
    },
    {
      key: 'vehicle_type',
      label: 'Vehicle Type',
      type: 'select',
      options: ['bus', 'van', 'car', 'train', 'flight'],
      helpText: 'Class of vehicle operating this route.',
    },
    {
      key: 'schedule',
      label: 'Schedule',
      type: 'textarea',
      placeholder: 'Departure days/times, frequency…',
    },
    {
      key: 'price_per_trip',
      label: 'Price Per Trip',
      type: 'number',
      placeholder: '0',
      helpText: 'Standard fare per passenger in EGP.',
    },
    {
      key: 'stops',
      label: 'Stops',
      type: 'textarea',
      placeholder: 'One stop per line, in order:\nAl-Tur\nDahab',
      helpText: 'One stop per line, listed in travel order.',
    },
    {
      key: 'amenities',
      label: 'Amenities',
      type: 'tags',
      multi: true,
      placeholder: 'Wi-Fi, AC, Reclining seats',
      helpText: 'Comma-separated list of onboard amenities.',
    },
  ],
  operations: [{ itemTypes: ['vehicle'], label: 'Vehicles', icon: '🚌', primary: true }],
};
