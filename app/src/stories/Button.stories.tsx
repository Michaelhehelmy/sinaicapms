import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '@/components/ui/Button';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'danger', 'success'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
    fullWidth: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = {
  args: {
    children: 'Button',
    variant: 'primary',
    size: 'md',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="success">Success</Button>
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

export const Loading: Story = {
  args: {
    children: 'Saving...',
    loading: true,
    variant: 'primary',
  },
};

export const WithLeftIcon: Story = {
  render: () => (
    <Button
      variant="primary"
      leftIcon={
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      }
    >
      Add Item
    </Button>
  ),
};

export const WithRightIcon: Story = {
  render: () => (
    <Button
      variant="primary"
      rightIcon={
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
      }
    >
      Continue
    </Button>
  ),
};

export const FullWidth: Story = {
  args: {
    children: 'Full Width Button',
    fullWidth: true,
    variant: 'primary',
  },
};

export const Disabled: Story = {
  args: {
    children: 'Disabled',
    disabled: true,
    variant: 'primary',
  },
};
