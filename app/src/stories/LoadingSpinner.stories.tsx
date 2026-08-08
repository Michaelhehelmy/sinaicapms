import type { Meta, StoryObj } from '@storybook/react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const meta: Meta<typeof LoadingSpinner> = {
  title: 'UI/LoadingSpinner',
  component: LoadingSpinner,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    variant: {
      control: 'select',
      options: ['spinner', 'dots', 'pulse'],
    },
    color: {
      control: 'select',
      options: ['brand', 'white', 'gray'],
    },
    text: { control: 'text' },
    fullScreen: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof LoadingSpinner>;

export const Small: Story = {
  args: {
    size: 'sm',
  },
};

export const Medium: Story = {
  args: {
    size: 'md',
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-8">
      <div className="flex flex-col items-center gap-2">
        <LoadingSpinner size="sm" />
        <span className="text-xs text-gray-500">Small</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <LoadingSpinner size="md" />
        <span className="text-xs text-gray-500">Medium</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <LoadingSpinner size="lg" />
        <span className="text-xs text-gray-500">Large</span>
      </div>
    </div>
  ),
};

export const WithText: Story = {
  args: {
    size: 'md',
    text: 'Loading...',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex items-center gap-8">
      <div className="flex flex-col items-center gap-2">
        <LoadingSpinner variant="spinner" />
        <span className="text-xs text-gray-500">Spinner</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <LoadingSpinner variant="dots" />
        <span className="text-xs text-gray-500">Dots</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <LoadingSpinner variant="pulse" />
        <span className="text-xs text-gray-500">Pulse</span>
      </div>
    </div>
  ),
};

export const AllColors: Story = {
  render: () => (
    <div className="flex items-center gap-8">
      <div className="flex flex-col items-center gap-2">
        <LoadingSpinner color="brand" />
        <span className="text-xs text-gray-500">Brand</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <LoadingSpinner color="gray" />
        <span className="text-xs text-gray-500">Gray</span>
      </div>
      <div className="bg-gray-800 p-4 rounded-lg">
        <div className="flex flex-col items-center gap-2">
          <LoadingSpinner color="white" />
          <span className="text-xs text-white">White</span>
        </div>
      </div>
    </div>
  ),
};

export const FullScreen: Story = {
  args: {
    fullScreen: true,
    text: 'Loading application...',
  },
  parameters: {
    docs: {
      description: {
        story: 'This story renders a full-screen overlay. In a real app, this would block the entire UI.',
      },
    },
  },
};
