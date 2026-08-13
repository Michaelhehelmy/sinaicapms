import type { Meta, StoryObj } from '@storybook/react';
import { Switch } from '@/components/ui/Switch';

const meta: Meta<typeof Switch> = {
  title: 'UI/Switch',
  component: Switch,
  tags: ['autodocs'],
  argTypes: {
    checked: { control: 'boolean' },
    label: { control: 'text' },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Switch>;

export const Default: Story = {
  args: { checked: true, label: 'Dark mode' },
};

export const Off: Story = {
  args: { checked: false, label: 'Notifications' },
};

export const Disabled: Story = {
  args: { checked: true, label: 'Locked setting', disabled: true },
};
