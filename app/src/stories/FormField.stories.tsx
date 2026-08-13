import type { Meta, StoryObj } from '@storybook/react';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

const meta: Meta<typeof FormField> = {
  title: 'UI/FormField',
  component: FormField,
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    hint: { control: 'text' },
    error: { control: 'text' },
    required: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof FormField>;

export const WithInput: Story = {
  render: (args) => (
    <div className="max-w-sm space-y-4">
      <FormField {...args} htmlFor="camp-name">
        <Input id="camp-name" placeholder="e.g. Bedouin Star Camp" />
      </FormField>
    </div>
  ),
  args: { label: 'Camp name', hint: 'Shown publicly on the marketplace', required: true },
};

export const WithError: Story = {
  render: (args) => (
    <div className="max-w-sm">
      <FormField {...args} htmlFor="camp-email">
        <Input id="camp-email" type="email" defaultValue="not-an-email" />
      </FormField>
    </div>
  ),
  args: { label: 'Contact email', error: 'Enter a valid email address' },
};

export const WithSelect: Story = {
  render: (args) => (
    <div className="max-w-sm">
      <FormField {...args} htmlFor="camp-type">
        <Select
          id="camp-type"
          defaultValue="camp"
          options={[
            { value: 'camp', label: 'Camp' },
            { value: 'supermarket', label: 'Supermarket' },
          ]}
        />
      </FormField>
    </div>
  ),
  args: { label: 'Business type' },
};
