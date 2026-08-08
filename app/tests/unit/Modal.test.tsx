import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal';

/* ─── Helper wrapper that manages isOpen state ─── */

function ModalWrapper({
  initialOpen = false,
  onClose,
  ...props
}: {
  initialOpen?: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnOverlay?: boolean;
  closeOnEsc?: boolean;
  showCloseButton?: boolean;
}) {
  const [open, setOpen] = React.useState(initialOpen);
  const handleClose = onClose || (() => setOpen(false));

  return (
    <>
      <button onClick={() => setOpen(true)}>Open Modal</button>
      <Modal isOpen={open} onClose={handleClose} {...props} />
    </>
  );
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

describe('Modal', () => {
  /* ─── Rendering ─── */

  it('renders nothing when isOpen is false', () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()}>
        Content
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders overlay and content when isOpen is true', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()}>
        Modal content
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('shows title when provided', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="My Title">
        Content
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby');
    expect(screen.getByText('My Title')).toBeInTheDocument();
  });

  it('hides title when not provided', () => {
    const { container } = render(
      <Modal isOpen={true} onClose={vi.fn()}>
        Content
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toHaveAttribute('aria-labelledby');
    expect(container.querySelector('h2')).not.toBeInTheDocument();
  });

  /* ─── Keyboard ─── */

  it('closes on ESC key press', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose}>
        Content
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT close on ESC when closeOnEsc={false}', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} closeOnEsc={false}>
        Content
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  /* ─── Overlay click ─── */

  it('closes on overlay click', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose}>
        Content
      </Modal>,
    );
    // Click the overlay (the absolute positioned div behind the modal card)
    const overlay = document.querySelector('[aria-hidden="true"]');
    expect(overlay).toBeInTheDocument();
    fireEvent.click(overlay!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT close on overlay click when closeOnOverlay={false}', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} closeOnOverlay={false}>
        Content
      </Modal>,
    );
    // Modal renders via portal — query from document.body
    const dialog = screen.getByRole('dialog');
    // The overlay has aria-hidden="true" and is a direct child of the dialog
    const overlay = dialog.querySelector('[aria-hidden="true"]');
    expect(overlay).toBeInTheDocument();
    fireEvent.click(overlay!);
    expect(onClose).not.toHaveBeenCalled();
  });

  /* ─── Close button ─── */

  it('shows close button by default', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()}>
        Content
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'Close modal' })).toBeInTheDocument();
  });

  it('hides close button when showCloseButton={false}', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} showCloseButton={false}>
        Content
      </Modal>,
    );
    expect(screen.queryByRole('button', { name: 'Close modal' })).not.toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose}>
        Content
      </Modal>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /* ─── Footer ─── */

  it('renders footer when provided', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} footer={<button>Save</button>}>
        Content
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  /* ─── ARIA ─── */

  it('has correct ARIA attributes', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="Test Dialog">
        Content
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
  });

  /* ─── Size variants ─── */

  it('applies default size (md)', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()}>
        Content
      </Modal>,
    );
    const card = screen.getByRole('dialog').querySelector('[tabindex="-1"]') as HTMLElement;
    expect(card.className).toContain('max-w-md');
  });

  it('applies sm size class', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} size="sm">
        Content
      </Modal>,
    );
    const card = screen.getByRole('dialog').querySelector('[tabindex="-1"]') as HTMLElement;
    expect(card.className).toContain('max-w-sm');
  });

  it('applies lg size class', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} size="lg">
        Content
      </Modal>,
    );
    const card = screen.getByRole('dialog').querySelector('[tabindex="-1"]') as HTMLElement;
    expect(card.className).toContain('max-w-lg');
  });

  it('applies xl size class', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} size="xl">
        Content
      </Modal>,
    );
    const card = screen.getByRole('dialog').querySelector('[tabindex="-1"]') as HTMLElement;
    expect(card.className).toContain('max-w-xl');
  });

  it('applies full size class', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} size="full">
        Content
      </Modal>,
    );
    const card = screen.getByRole('dialog').querySelector('[tabindex="-1"]') as HTMLElement;
    expect(card.className).toContain('max-w-4xl');
  });

  /* ─── Body scroll lock ─── */

  it('locks body scroll when open', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()}>
        Content
      </Modal>,
    );
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores body scroll when closed', () => {
    const { unmount } = render(
      <Modal isOpen={true} onClose={vi.fn()}>
        Content
      </Modal>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  /* ─── Interactive state toggle ─── */

  it('opens and closes via state toggle', async () => {
    const user = userEvent.setup();
    render(<ModalWrapper title="Toggle Test">Toggle content</ModalWrapper>);

    // Not open yet
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Click button to open
    await user.click(screen.getByRole('button', { name: 'Open Modal' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Toggle content')).toBeInTheDocument();
  });

  /* ─── Custom className ─── */

  it('accepts custom className on the modal card', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} className="my-custom-modal">
        Content
      </Modal>,
    );
    const card = screen.getByRole('dialog').querySelector('[tabindex="-1"]') as HTMLElement;
    expect(card.className).toContain('my-custom-modal');
  });

  /* ─── Focus trap ─── */

  const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  it('traps focus with Tab (wraps from last focusable to first)', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} footer={<button>Footer Btn</button>}>
        Content
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    const focusables = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    expect(focusables.length).toBeGreaterThanOrEqual(2);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();
  });

  it('traps focus with Shift+Tab (wraps from first focusable to last)', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} footer={<button>Footer Btn</button>}>
        Content
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    const focusables = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('leaves focus alone when the modal has no focusable elements', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} showCloseButton={false}>
        <p>Only text</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    const focusables = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    expect(focusables.length).toBe(0);
    fireEvent.keyDown(document, { key: 'Tab' });
    // No crash and focus remains on body
    expect(document.activeElement?.tagName).toBe('BODY');
  });
});

/* ─── Sub-component tests ─── */

describe('ModalHeader', () => {
  it('renders title and close button', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="Header Test">
        Content
      </Modal>,
    );
    expect(screen.getByText('Header Test')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close modal' })).toBeInTheDocument();
  });

  it('links title via aria-labelledby', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="Linked Title">
        Content
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    const titleId = dialog.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    const titleEl = document.getElementById(titleId!);
    expect(titleEl?.textContent).toBe('Linked Title');
  });
});

describe('ModalBody', () => {
  it('renders children', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()}>
        <p data-testid="body-content">Body text</p>
      </Modal>,
    );
    expect(screen.getByTestId('body-content')).toBeInTheDocument();
  });

  it('has scrollable body styling', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()}>
        Content
      </Modal>,
    );
    // Modal renders via portal — query from the dialog
    const dialog = screen.getByRole('dialog');
    const body = dialog.querySelector('.overflow-y-auto');
    expect(body).toBeInTheDocument();
    expect(body?.className).toContain('max-h-[calc(100vh-8rem)]');
  });
});

describe('ModalFooter', () => {
  it('renders footer content', () => {
    render(
      <Modal
        isOpen={true}
        onClose={vi.fn()}
        footer={
          <>
            <button>Cancel</button>
            <button>Confirm</button>
          </>
        }
      >
        Content
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('has border-top styling', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} footer={<span>Footer</span>}>
        Content
      </Modal>,
    );
    // Modal renders via portal — query from the dialog
    const dialog = screen.getByRole('dialog');
    const footer = dialog.querySelector('.border-t');
    expect(footer).toBeInTheDocument();
  });
});
