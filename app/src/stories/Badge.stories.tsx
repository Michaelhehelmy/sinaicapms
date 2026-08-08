import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from '@/components/ui/Badge';

const meta: Meta<typeof Badge> = {
  title: 'UI/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'success', 'warning', 'error', 'info', 'neutral'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    dot: { control: 'boolean' },
    removable: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  args: {
    children: 'Badge',
    variant: 'default',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default">Default</Badge>
      <Badge variant="success">Success</Badge>
      <Badge variant="warning">Warning</Badge>
      <Badge variant="error">Error</Badge>
      <Badge variant="info">Info</Badge>
      <Badge variant="neutral">Neutral</Badge>
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Badge size="sm">Small</Badge>
      <Badge size="md">Medium</Badge>
      <Badge size="lg">Large</Badge>
    </div>
  ),
};

export const WithDot: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="success" dot>Active</Badge>
      <Badge variant="warning" dot>Pending</Badge>
      <Badge variant="error" dot>Failed</Badge>
      <Badge variant="info" dot>In Progress</Badge>
    </div>
  ),
};

export const Removable: Story = {
  args: {
    children: 'Removable Badge',
    removable: true,
    variant: 'info',
    onRemove: () => alert('Badge removed!'),
  },
};

export const StatusIndicators: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="success" dot size="lg">Confirmed</Badge>
      <Badge variant="warning" dot size="lg">Pending</Badge>
      <Badge variant="error" dot size="lg">Cancelled</Badge>
      <Badge variant="info" dot size="lg">Checked In</Badge>
      <Badge variant="neutral" dot size="lg">Inactive</Badge>
    </div>
  ),
};
