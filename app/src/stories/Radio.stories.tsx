import type { Meta, StoryObj } from '@storybook/react';
import { RadioGroup, RadioItem } from '@/components/ui/Radio';

const meta: Meta<typeof RadioGroup> = {
  title: 'UI/Radio',
  component: RadioGroup,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof RadioGroup>;

export const Default: Story = {
  render: () => (
    <RadioGroup name="meal" defaultValue="full">
      <RadioItem value="full" label="Full board" description="3 meals a day" />
      <RadioItem value="half" label="Half board" description="Breakfast + dinner" />
      <RadioItem value="self" label="Self catered" />
    </RadioGroup>
  ),
};

export const Disabled: Story = {
  render: () => (
    <RadioGroup name="meal2" defaultValue="full" disabled>
      <RadioItem value="full" label="Full board" />
      <RadioItem value="half" label="Half board" />
    </RadioGroup>
  ),
};
