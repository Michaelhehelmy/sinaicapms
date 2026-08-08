import type { Meta, StoryObj } from '@storybook/react';
import { EmptyState } from '@/components/ui/EmptyState';

const meta: Meta<typeof EmptyState> = {
  title: 'UI/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: {
    title: 'No items found',
    description: 'There are no items to display at the moment.',
  },
};

export const WithAction: Story = {
  args: {
    title: 'No reservations yet',
    description: 'When a guest makes a reservation, it will appear here.',
    action: {
      label: 'New Reservation',
      onClick: () => alert('Create reservation clicked!'),
    },
  },
};

export const WithCustomIcon: Story = {
  render: () => (
    <EmptyState
      icon={
        <svg
          className="mx-auto h-12 w-12 text-brand-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
          />
        </svg>
      }
      title="Welcome to SinaiCamps"
      description="Get started by creating your first camp listing."
      action={{
        label: 'Create Camp',
        onClick: () => alert('Create camp clicked!'),
      }}
    />
  ),
};

export const Minimal: Story = {
  args: {
    title: 'Nothing here',
  },
};
