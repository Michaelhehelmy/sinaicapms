import type { ProjectTypeSchema } from './index';

/**
 * Supermarket project type — a retail store location: trading hours, accepted
 * payment methods, delivery coverage, and merchandising categories in meta.
 */
export const supermarketProjectType: ProjectTypeSchema = {
  type: 'supermarket',
  label: 'Supermarket',
  icon: '🛒',
  description: 'A grocery or retail store location with products and delivery options.',
  coreFields: ['name', 'location', 'description', 'status'],
  metaFields: [
    {
      key: 'opening_hours',
      label: 'Opening Hours',
      type: 'text',
      placeholder: 'e.g., Daily 08:00–22:00',
    },
    {
      key: 'payment_methods',
      label: 'Payment Methods',
      type: 'tags',
      multi: true,
      placeholder: 'Cash, Card, InstaPay',
      helpText: 'Comma-separated list of accepted payment methods.',
    },
    {
      key: 'delivery_available',
      label: 'Delivery Available',
      type: 'select',
      options: ['yes', 'no'],
      helpText: 'Whether this store delivers to customers.',
    },
    {
      key: 'product_categories',
      label: 'Product Categories',
      type: 'tags',
      multi: true,
      placeholder: 'Produce, Bakery, Household',
      helpText: 'Comma-separated list of product categories stocked.',
    },
    {
      key: 'loyalty_program',
      label: 'Loyalty Program',
      type: 'text',
      placeholder: 'e.g., Points card, Member discounts',
    },
  ],
};
