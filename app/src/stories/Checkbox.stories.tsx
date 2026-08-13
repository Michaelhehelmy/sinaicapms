import type { Meta, StoryObj } from '@storybook/react';
import { Checkbox } from '@/components/ui/Checkbox';

const meta: Meta<typeof Checkbox> = {
  title: 'UI/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    description: { control: 'text' },
    error: { control: 'text' },
    disabled: { control: 'boolean' },
    checked: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Default: Story = {
  args: { label: 'Send me booking confirmations', defaultChecked: true },
};

export const WithDescription: Story = {
  args: { label: 'Terms', description: 'I agree to the terms of service' },
};

export const WithError: Story = {
  args: { label: 'Accept liability waiver', error: 'This field is required' },
};

export const Disabled: Story = {
  args: { label: 'Disabled option', disabled: true },
};
