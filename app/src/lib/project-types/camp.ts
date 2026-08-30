import type { ProjectTypeSchema } from './index';

/**
 * Camp project type — the original SinaiCamps vertical. A camp project is a
 * bookable accommodation location: activities, stay windows, and on-site
 * logistics live in meta; rooms/rate plans hang off the project itself.
 */
export const campProjectType: ProjectTypeSchema = {
  type: 'camp',
  label: 'Camp',
  icon: '🏕️',
  description: 'A bookable camp or resort location with accommodations and activities.',
  coreFields: ['name', 'location', 'start_date', 'end_date', 'capacity', 'description', 'status'],
  metaFields: [
    {
      key: 'activities',
      label: 'Activities',
      type: 'tags',
      multi: true,
      placeholder: 'Hiking, Stargazing, Snorkeling',
      helpText: 'Comma-separated list of activities offered at this camp.',
    },
    {
      key: 'notes',
      label: 'Notes',
      type: 'textarea',
      placeholder: 'Internal notes about this camp…',
    },
    {
      key: 'weather_conditions',
      label: 'Weather Conditions',
      type: 'text',
      placeholder: 'e.g., Hot days, cool nights',
    },
    {
      key: 'accommodation_type',
      label: 'Accommodation Type',
      type: 'select',
      options: ['tent', 'cabin', 'hotel', 'mixed'],
      helpText: 'Primary style of accommodation provided.',
    },
    {
      key: 'emergency_contact',
      label: 'Emergency Contact',
      type: 'text',
      placeholder: 'Name and phone number',
    },
    {
      key: 'check_in_time',
      label: 'Check-in Time',
      type: 'text',
      placeholder: 'e.g., 14:00',
    },
    {
      key: 'check_out_time',
      label: 'Check-out Time',
      type: 'text',
      placeholder: 'e.g., 12:00',
    },
  ],
  operations: [{ itemTypes: ['room'], label: 'Rooms', icon: '🛏️', primary: true }],
};
