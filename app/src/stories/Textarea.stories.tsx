import type { Meta, StoryObj } from '@storybook/react';
import { Textarea } from '@/components/ui/Textarea';

const meta: Meta<typeof Textarea> = {
  title: 'UI/Textarea',
  component: Textarea,
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    placeholder: { control: 'text' },
    error: { control: 'text' },
    helperText: { control: 'text' },
    disabled: { control: 'boolean' },
    rows: { control: 'number' },
  },
};

export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  args: {
    label: 'Special requests',
    rows: 3,
    placeholder: 'Dietary needs, pickup time…',
  },
};

export const WithHelper: Story = {
  args: {
    label: 'Notes',
    helperText: 'Visible only to camp staff.',
    rows: 2,
  },
};

export const WithError: Story = {
  args: { label: 'Notes', error: 'Notes are required', rows: 2 },
};

export const Disabled: Story = {
  args: { label: 'Read-only', value: 'Already submitted', disabled: true, rows: 2 },
};
