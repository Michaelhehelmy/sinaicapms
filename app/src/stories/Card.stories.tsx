import type { Meta, StoryObj } from '@storybook/react';
import { Card, CardHeader, CardBody, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const meta: Meta<typeof Card> = {
  title: 'UI/Card',
  component: Card,
  tags: ['autodocs'],
  argTypes: {
    hover: { control: 'boolean' },
    padding: {
      control: 'select',
      options: ['none', 'sm', 'md', 'lg'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  args: {
    children: 'Simple card content with default padding.',
    padding: 'md',
  },
};

export const WithHeaderAndFooter: Story = {
  render: () => (
    <Card padding="none">
      <CardHeader>
        <h3 className="text-lg font-semibold text-gray-900">Card Title</h3>
      </CardHeader>
      <CardBody>
        <p className="text-gray-600">
          This is the card body content. You can put any content here including text,
          images, forms, or other components.
        </p>
      </CardBody>
      <CardFooter>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm">Cancel</Button>
          <Button variant="primary" size="sm">Save</Button>
        </div>
      </CardFooter>
    </Card>
  ),
};

export const Hoverable: Story = {
  args: {
    hover: true,
    children: 'Hover over this card to see the elevated shadow effect.',
    padding: 'md',
  },
};

export const NoPadding: Story = {
  args: {
    padding: 'none',
    children: (
      <div className="p-6">
        <p className="text-gray-600">This card has no built-in padding, so we added custom padding to the content.</p>
      </div>
    ),
  },
};

export const WithAction: Story = {
  render: () => (
    <Card>
      <CardHeader action={<Button variant="ghost" size="sm">Edit</Button>}>
        <h3 className="text-lg font-semibold text-gray-900">Settings</h3>
      </CardHeader>
      <CardBody>
        <p className="text-gray-600">Configure your application settings here.</p>
      </CardBody>
    </Card>
  ),
};

export const AllPaddingSizes: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Card padding="sm">
        <p className="text-sm text-gray-600">Small padding</p>
      </Card>
      <Card padding="md">
        <p className="text-sm text-gray-600">Medium padding (default)</p>
      </Card>
      <Card padding="lg">
        <p className="text-sm text-gray-600">Large padding</p>
      </Card>
    </div>
  ),
};
