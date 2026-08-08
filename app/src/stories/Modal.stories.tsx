import type { Meta, StoryObj } from '@storybook/react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import React, { useState } from 'react';

const meta: Meta<typeof Modal> = {
  title: 'UI/Modal',
  component: Modal,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl', 'full'],
    },
    isOpen: { control: 'boolean' },
    closeOnOverlay: { control: 'boolean' },
    closeOnEsc: { control: 'boolean' },
    showCloseButton: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Modal>;

function ModalDemo({ size = 'md', children, ...props }: React.ComponentProps<typeof Modal>) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <Button onClick={() => setIsOpen(true)}>Open Modal</Button>
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        size={size}
        {...props}
      >
        {children}
      </Modal>
    </div>
  );
}

export const Default: Story = {
  render: () => (
    <ModalDemo title="Default Modal">
      <p className="text-gray-600">
        This is a default-sized modal dialog. You can put any content here.
      </p>
    </ModalDemo>
  ),
};

export const Small: Story = {
  render: () => (
    <ModalDemo title="Small Modal" size="sm">
      <p className="text-gray-600">
        This is a small modal, perfect for simple confirmations.
      </p>
    </ModalDemo>
  ),
};

export const Large: Story = {
  render: () => (
    <ModalDemo title="Large Modal" size="lg">
      <div className="space-y-4">
        <p className="text-gray-600">
          This is a large modal with more space for complex content.
        </p>
        <p className="text-gray-600">
          You can include forms, tables, or any other components here.
        </p>
        <p className="text-gray-600">
          The modal will scroll if the content exceeds the maximum height.
        </p>
      </div>
    </ModalDemo>
  ),
};

export const WithFooter: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <div>
        <Button onClick={() => setIsOpen(true)}>Open Modal with Footer</Button>
        <Modal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title="Confirm Action"
          footer={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setIsOpen(false)}>
                Confirm
              </Button>
            </div>
          }
        >
          <p className="text-gray-600">
            Are you sure you want to proceed with this action? This cannot be undone.
          </p>
        </Modal>
      </div>
    );
  },
};

export const WithoutCloseButton: Story = {
  render: () => (
    <ModalDemo title="No Close Button" showCloseButton={false}>
      <div className="space-y-4">
        <p className="text-gray-600">
          This modal does not have a close button. You can only close it by clicking the overlay or pressing Escape.
        </p>
        <Button variant="secondary" onClick={() => alert('Custom close action')}>
          Close Modal
        </Button>
      </div>
    </ModalDemo>
  ),
};

export const FullSize: Story = {
  render: () => (
    <ModalDemo title="Full Size Modal" size="full">
      <div className="space-y-4">
        <p className="text-gray-600">
          This is a full-size modal that takes up most of the viewport width.
        </p>
        <p className="text-gray-600">
          Perfect for complex forms, data tables, or detailed content.
        </p>
      </div>
    </ModalDemo>
  ),
};

export const AllSizes: Story = {
  render: () => {
    const [activeSize, setActiveSize] = useState<string | null>(null);

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {['sm', 'md', 'lg', 'xl', 'full'].map((size) => (
            <Button
              key={size}
              variant="secondary"
              onClick={() => setActiveSize(size)}
            >
              Open {size.toUpperCase()} Modal
            </Button>
          ))}
        </div>

        <Modal
          isOpen={activeSize === 'sm'}
          onClose={() => setActiveSize(null)}
          size="sm"
          title="Small Modal"
        >
          <p className="text-gray-600">Small size modal content.</p>
        </Modal>

        <Modal
          isOpen={activeSize === 'md'}
          onClose={() => setActiveSize(null)}
          size="md"
          title="Medium Modal"
        >
          <p className="text-gray-600">Medium size modal content.</p>
        </Modal>

        <Modal
          isOpen={activeSize === 'lg'}
          onClose={() => setActiveSize(null)}
          size="lg"
          title="Large Modal"
        >
          <p className="text-gray-600">Large size modal content.</p>
        </Modal>

        <Modal
          isOpen={activeSize === 'xl'}
          onClose={() => setActiveSize(null)}
          size="xl"
          title="Extra Large Modal"
        >
          <p className="text-gray-600">Extra large size modal content.</p>
        </Modal>

        <Modal
          isOpen={activeSize === 'full'}
          onClose={() => setActiveSize(null)}
          size="full"
          title="Full Size Modal"
        >
          <p className="text-gray-600">Full size modal content.</p>
        </Modal>
      </div>
    );
  },
};
