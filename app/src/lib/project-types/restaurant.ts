import type { ProjectTypeSchema } from './index';

/**
 * Restaurant project type — a dining venue: cuisine styles, hours, seating,
 * reservations policy, signature dishes, and dietary accommodations.
 */
export const restaurantProjectType: ProjectTypeSchema = {
  type: 'restaurant',
  label: 'Restaurant',
  icon: '🍽️',
  description: 'A dining venue serving food to guests on-site or for takeaway.',
  coreFields: ['name', 'location', 'description', 'status'],
  metaFields: [
    {
      key: 'cuisine_type',
      label: 'Cuisine Types',
      type: 'tags',
      multi: true,
      placeholder: 'Bedouin, Seafood, Grill',
      helpText: 'Comma-separated list of cuisine styles served.',
    },
    {
      key: 'opening_hours',
      label: 'Opening Hours',
      type: 'text',
      placeholder: 'e.g., Daily 12:00–23:00',
    },
    {
      key: 'seating_capacity',
      label: 'Seating Capacity',
      type: 'number',
      placeholder: '0',
      min: 0,
      helpText: 'Total number of seats available.',
    },
    {
      key: 'reservation_required',
      label: 'Reservation Required',
      type: 'select',
      options: ['yes', 'no'],
      helpText: 'Whether guests must reserve a table in advance.',
    },
    {
      key: 'menu_highlights',
      label: 'Menu Highlights',
      type: 'textarea',
      placeholder: 'Signature dishes, seasonal specials…',
    },
    {
      key: 'dietary_options',
      label: 'Dietary Options',
      type: 'tags',
      multi: true,
      placeholder: 'Vegetarian, Vegan, Gluten-free',
      helpText: 'Comma-separated list of dietary accommodations.',
    },
  ],
};
