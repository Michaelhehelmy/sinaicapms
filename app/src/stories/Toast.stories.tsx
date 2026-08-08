import type { Meta, StoryObj } from '@storybook/react';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';

const meta: Meta<typeof ToastProvider> = {
  title: 'UI/Toast',
  component: ToastProvider,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ToastProvider>;

function ToastDemo() {
  const { showToast } = useToast();

  return (
    <div className="flex flex-wrap gap-4">
      <Button
        variant="success"
        onClick={() => showToast('Operation completed successfully!', 'success')}
      >
        Success Toast
      </Button>
      <Button
        variant="danger"
        onClick={() => showToast('Something went wrong. Please try again.', 'error')}
      >
        Error Toast
      </Button>
      <Button
        variant="secondary"
        onClick={() => showToast('Please check your input.', 'warning')}
      >
        Warning Toast
      </Button>
      <Button
        variant="secondary"
        onClick={() => showToast('Here is some helpful information.', 'info')}
      >
        Info Toast
      </Button>
    </div>
  );
}

function ToastWithAction() {
  const { showToast } = useToast();

  return (
    <Button
      variant="primary"
      onClick={() =>
        showToast('Item deleted', 'success', {
          action: { label: 'Undo', onClick: () => alert('Undo clicked!') },
        })
      }
    >
      Show Toast with Action
    </Button>
  );
}

function AllToasts() {
  const { showToast } = useToast();

  return (
    <div className="flex flex-wrap gap-4">
      <Button
        variant="success"
        onClick={() => {
          showToast('Success message', 'success');
          showToast('Error message', 'error');
          showToast('Warning message', 'warning');
          showToast('Info message', 'info');
        }}
      >
        Show All Toasts
      </Button>
    </div>
  );
}

export const Success: Story = {
  render: () => (
    <ToastProvider>
      <ToastDemo />
    </ToastProvider>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Click the "Success Toast" button to see a success notification.',
      },
    },
  },
};

export const Error: Story = {
  render: () => (
    <ToastProvider>
      <ToastDemo />
    </ToastProvider>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Click the "Error Toast" button to see an error notification.',
      },
    },
  },
};

export const Warning: Story = {
  render: () => (
    <ToastProvider>
      <ToastDemo />
    </ToastProvider>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Click the "Warning Toast" button to see a warning notification.',
      },
    },
  },
};

export const Info: Story = {
  render: () => (
    <ToastProvider>
      <ToastDemo />
    </ToastProvider>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Click the "Info Toast" button to see an info notification.',
      },
    },
  },
};

export const WithAction: Story = {
  render: () => (
    <ToastProvider>
      <ToastWithAction />
    </ToastProvider>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Toast with an action button that triggers a callback.',
      },
    },
  },
};

export const ShowAll: Story = {
  render: () => (
    <ToastProvider>
      <AllToasts />
    </ToastProvider>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Displays all toast variants simultaneously.',
      },
    },
  },
};
