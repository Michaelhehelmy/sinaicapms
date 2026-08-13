import type { Meta, StoryObj } from '@storybook/react';
import { Tooltip } from '@/components/ui/Tooltip';
import { Button } from '@/components/ui/Button';

const meta: Meta<typeof Tooltip> = {
  title: 'UI/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  argTypes: {
    content: { control: 'text' },
    side: { control: 'select', options: ['top', 'bottom', 'left', 'right'] },
  },
};

export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  args: { content: 'Delete permanently' },
  render: (args) => (
    <div className="flex min-h-40 items-center justify-center">
      <Tooltip {...args}>
        <Button variant="danger" aria-label="Delete">
          Delete
        </Button>
      </Tooltip>
    </div>
  ),
};

export const Bottom: Story = {
  args: { content: 'Opens the booking calendar', side: 'bottom' },
  render: (args) => (
    <div className="flex min-h-40 items-center justify-center">
      <Tooltip {...args}>
        <Button>Book now</Button>
      </Tooltip>
    </div>
  ),
};
