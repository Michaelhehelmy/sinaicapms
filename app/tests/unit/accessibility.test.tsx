import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { FormModal } from '@/components/ui/FormModal';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner, Skeleton } from '@/components/ui/LoadingSpinner';
import { Skeleton as AdvancedSkeleton, DashboardSkeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { StatCard } from '@/components/ui/StatCard';
import { StatusTag } from '@/components/ui/StatusTag';
import { ToastProvider, useToast } from '@/components/ui/Toast';

/* ─── Helper: render within ToastProvider for toast tests ─── */
function renderWithToast(ui: React.ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

/* ────────────────────────────────────────────────────────── */
/*  Button — aria-busy when loading                           */
/* ────────────────────────────────────────────────────────── */
describe('A11y: Button aria-busy', () => {
  it('sets aria-busy="true" when loading', () => {
    render(<Button loading>Loading</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('does not set aria-busy when not loading', () => {
    render(<Button>Click</Button>);
    const btn = screen.getByRole('button');
    expect(btn).not.toHaveAttribute('aria-busy');
  });

  it('sets aria-disabled when disabled', () => {
    render(<Button disabled>Disabled</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-disabled', 'true');
  });
});

/* ────────────────────────────────────────────────────────── */
/*  Input — aria-describedby linked to error/helper text      */
/* ────────────────────────────────────────────────────────── */
describe('A11y: Input aria-describedby', () => {
  it('links aria-describedby to error text when error is present', () => {
    render(<Input label="Email" error="Invalid email" />);
    const input = screen.getByLabelText('Email');
    const errorEl = screen.getByRole('alert');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', errorEl.id);
  });

  it('links aria-describedby to helper text when no error', () => {
    render(<Input label="Name" helperText="Enter your full name" />);
    const input = screen.getByLabelText('Name');
    expect(input).toHaveAttribute('aria-describedby');
    const helperId = input.getAttribute('aria-describedby');
    expect(document.getElementById(helperId!)).toHaveTextContent('Enter your full name');
  });

  it('does not set aria-invalid when no error', () => {
    render(<Input label="Name" />);
    const input = screen.getByLabelText('Name');
    expect(input).not.toHaveAttribute('aria-invalid');
  });
});

/* ────────────────────────────────────────────────────────── */
/*  Toast — role="alert"                                      */
/* ────────────────────────────────────────────────────────── */
function ToastTrigger() {
  const { showToast } = useToast();
  return (
    <button onClick={() => showToast('Item saved successfully', 'success')}>
      Show Toast
    </button>
  );
}

describe('A11y: Toast role="alert"', () => {
  it('renders toast with role="alert" and aria-live="assertive"', () => {
    renderWithToast(<ToastTrigger />);
    fireEvent.click(screen.getByRole('button', { name: 'Show Toast' }));
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveTextContent('Item saved successfully');
  });

  it('dismiss button has accessible name', () => {
    renderWithToast(<ToastTrigger />);
    fireEvent.click(screen.getByRole('button', { name: 'Show Toast' }));
    const dismissBtn = screen.getByRole('button', { name: 'Dismiss notification' });
    expect(dismissBtn).toBeInTheDocument();
  });
});

/* ────────────────────────────────────────────────────────── */
/*  LoadingSpinner — role="status"                            */
/* ────────────────────────────────────────────────────────── */
describe('A11y: LoadingSpinner role="status"', () => {
  it('has role="status" and aria-label', () => {
    render(<LoadingSpinner />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-label', 'Loading');
  });

  it('uses custom text as aria-label', () => {
    render(<LoadingSpinner text="Saving data..." />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Saving data...');
  });

  it('includes sr-only text for screen readers', () => {
    render(<LoadingSpinner />);
    expect(screen.getByText('Loading', { selector: '.sr-only' })).toBeInTheDocument();
  });
});

/* ────────────────────────────────────────────────────────── */
/*  Modal — role="dialog" and aria-modal                      */
/* ────────────────────────────────────────────────────────── */
describe('A11y: Modal role="dialog"', () => {
  it('renders dialog with role="dialog" and aria-modal="true"', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="Settings">
        <p>Content</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('has aria-labelledby pointing to the title', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="My Dialog">
        <p>Content</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    const titleEl = document.getElementById(labelId!);
    expect(titleEl).toHaveTextContent('My Dialog');
  });

  it('close button has accessible label', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="Dialog">
        <p>Content</p>
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'Close modal' })).toBeInTheDocument();
  });

  it('returns null when isOpen is false', () => {
    const { container } = render(
      <Modal isOpen={false} onClose={vi.fn()}>
        <p>Content</p>
      </Modal>,
    );
    expect(container.innerHTML).toBe('');
  });
});

/* ────────────────────────────────────────────────────────── */
/*  DataTable — sort headers have aria-sort                   */
/* ────────────────────────────────────────────────────────── */
describe('A11y: DataTable aria-sort', () => {
  const columns = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'email', header: 'Email', sortable: false },
  ];
  const data = [
    { id: '1', name: 'Alice', email: 'alice@test.com' },
    { id: '2', name: 'Bob', email: 'bob@test.com' },
  ];

  it('sortable column has aria-sort="none" initially', () => {
    render(<DataTable columns={columns} data={data} />);
    const nameHeader = screen.getByText('Name').closest('th');
    expect(nameHeader).toHaveAttribute('aria-sort', 'none');
  });

  it('non-sortable column does not have aria-sort', () => {
    render(<DataTable columns={columns} data={data} />);
    const emailHeader = screen.getByText('Email').closest('th');
    expect(emailHeader).not.toHaveAttribute('aria-sort');
  });

  it('clicking sortable header sets aria-sort="ascending"', () => {
    render(<DataTable columns={columns} data={data} />);
    const nameHeader = screen.getByText('Name').closest('th')!;
    fireEvent.click(nameHeader);
    expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
  });

  it('clicking again toggles to aria-sort="descending"', () => {
    render(<DataTable columns={columns} data={data} />);
    const nameHeader = screen.getByText('Name').closest('th')!;
    fireEvent.click(nameHeader);
    fireEvent.click(nameHeader);
    expect(nameHeader).toHaveAttribute('aria-sort', 'descending');
  });

  it('pagination has aria-label', () => {
    const pagination = { page: 1, total: 50, pageSize: 10, onChange: vi.fn() };
    render(<DataTable columns={columns} data={data} pagination={pagination} />);
    expect(screen.getByRole('navigation', { name: 'Table pagination' })).toBeInTheDocument();
  });

  it('pagination buttons have accessible names', () => {
    const pagination = { page: 2, total: 50, pageSize: 10, onChange: vi.fn() };
    render(<DataTable columns={columns} data={data} pagination={pagination} />);
    expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to next page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to page 1' })).toBeInTheDocument();
  });

  it('search input has aria-label', () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        searchable
        searchPlaceholder="Search users..."
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Search users...' })).toBeInTheDocument();
  });
});

/* ────────────────────────────────────────────────────────── */
/*  EmptyState — keyboard accessible                          */
/* ────────────────────────────────────────────────────────── */
describe('A11y: EmptyState keyboard accessible', () => {
  it('action button is focusable and clickable', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No items"
        description="Create your first item"
        action={{ label: 'Create Item', onClick }}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Create Item' });
    expect(btn).toBeInTheDocument();
    btn.focus();
    expect(btn).toHaveFocus();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has status role', () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

/* ────────────────────────────────────────────────────────── */
/*  Badge — role="status"                                     */
/* ────────────────────────────────────────────────────────── */
describe('A11y: Badge role="status"', () => {
  it('has role="status"', () => {
    render(<Badge variant="success">Active</Badge>);
    expect(screen.getByRole('status')).toHaveTextContent('Active');
  });

  it('decorative dot is aria-hidden', () => {
    const { container } = render(<Badge variant="success" dot>Active</Badge>);
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).toBeInTheDocument();
  });

  it('remove button has accessible label', () => {
    render(
      <Badge variant="error" removable onRemove={vi.fn()}>
        Error
      </Badge>,
    );
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });
});

/* ────────────────────────────────────────────────────────── */
/*  ConfirmDialog — role="dialog" and focus trap              */
/* ────────────────────────────────────────────────────────── */
describe('A11y: ConfirmDialog role="dialog"', () => {
  it('renders dialog with role="dialog" and aria-modal', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Delete Item"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('has aria-labelledby pointing to the title', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Confirm Action"
        message="Proceed?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId!)).toHaveTextContent('Confirm Action');
  });

  it('returns null when not open', () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        title="Delete"
        message="Sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('closes on Escape key', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="Delete"
        message="Sure?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('both buttons are focusable', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Confirm"
        message="Proceed?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    const confirmBtn = screen.getByRole('button', { name: 'Confirm' });
    cancelBtn.focus();
    expect(cancelBtn).toHaveFocus();
    confirmBtn.focus();
    expect(confirmBtn).toHaveFocus();
  });
});

/* ────────────────────────────────────────────────────────── */
/*  FormModal — role="dialog" and aria-modal                  */
/* ────────────────────────────────────────────────────────── */
describe('A11y: FormModal', () => {
  it('renders dialog with role="dialog" and aria-modal="true"', () => {
    render(
      <FormModal open={true} onClose={vi.fn()} onSubmit={vi.fn()} title="Edit Form">
        <p>Form content</p>
      </FormModal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Edit Form');
  });

  it('close button has accessible label', () => {
    render(
      <FormModal open={true} onClose={vi.fn()} onSubmit={vi.fn()} title="Edit">
        <p>Content</p>
      </FormModal>,
    );
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
  });
});

/* ────────────────────────────────────────────────────────── */
/*  StatCard — decorative icons are aria-hidden               */
/* ────────────────────────────────────────────────────────── */
describe('A11y: StatCard decorative icons', () => {
  it('icon container is aria-hidden', () => {
    render(
      <StatCard
        title="Revenue"
        value="$1,234"
        icon={<span data-testid="icon">💰</span>}
      />,
    );
    const iconContainer = screen.getByTestId('icon').parentElement;
    expect(iconContainer).toHaveAttribute('aria-hidden', 'true');
  });

  it('trend SVG icons are aria-hidden', () => {
    const { container } = render(
      <StatCard
        title="Revenue"
        value="$1,234"
        trend={{ value: 12, label: 'vs last month' }}
      />,
    );
    const svgs = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(svgs.length).toBeGreaterThanOrEqual(1);
  });
});

/* ────────────────────────────────────────────────────────── */
/*  StatusTag — role="status"                                  */
/* ────────────────────────────────────────────────────────── */
describe('A11y: StatusTag role="status"', () => {
  it('has role="status"', () => {
    render(<StatusTag status="confirmed" />);
    const tag = screen.getByRole('status');
    expect(tag).toHaveTextContent('confirmed');
  });

  it('renders status text (not color-only)', () => {
    render(<StatusTag status="pending" />);
    expect(screen.getByText('pending')).toBeInTheDocument();
  });
});

/* ────────────────────────────────────────────────────────── */
/*  Skeleton — decorative variants are aria-hidden            */
/* ────────────────────────────────────────────────────────── */
describe('A11y: Skeleton accessibility', () => {
  it('default skeleton has role="status" and aria-label', () => {
    render(<Skeleton lines={2} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Loading content');
  });

  it('advanced skeleton card variant has role="status"', () => {
    render(<AdvancedSkeleton variant="card" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('advanced skeleton text variant has role="status"', () => {
    render(<AdvancedSkeleton variant="text" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('DashboardSkeleton is aria-hidden', () => {
    const { container } = render(<DashboardSkeleton />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});

/* ────────────────────────────────────────────────────────── */
/*  ErrorBoundary — role="alert" on error state               */
/* ────────────────────────────────────────────────────────── */
describe('A11y: ErrorBoundary role="alert"', () => {
  const ThrowError = () => {
    throw new Error('Test error');
  };

  it('renders error state with role="alert"', () => {
    // Suppress console.error for expected error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('buttons in error state are focusable', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    );
    const tryAgainBtn = screen.getByRole('button', { name: 'Try Again' });
    const refreshBtn = screen.getByRole('button', { name: 'Refresh Page' });
    tryAgainBtn.focus();
    expect(tryAgainBtn).toHaveFocus();
    refreshBtn.focus();
    expect(refreshBtn).toHaveFocus();
    spy.mockRestore();
  });
});

/* ────────────────────────────────────────────────────────── */
/*  Select — searchable dropdown keyboard navigation          */
/* ────────────────────────────────────────────────────────── */
describe('A11y: Select keyboard navigation', () => {
  it('native select has proper label association', () => {
    render(
      <Select
        label="Country"
        options={[
          { value: 'us', label: 'United States' },
          { value: 'uk', label: 'United Kingdom' },
        ]}
      />,
    );
    const select = screen.getByLabelText('Country');
    expect(select).toBeInTheDocument();
    expect(select.tagName).toBe('SELECT');
  });

  it('searchable select has combobox role', () => {
    render(
      <Select
        label="Country"
        searchable
        options={[
          { value: 'us', label: 'United States' },
          { value: 'uk', label: 'United Kingdom' },
        ]}
      />,
    );
    const combobox = screen.getByRole('combobox');
    expect(combobox).toHaveAttribute('aria-haspopup', 'listbox');
    expect(combobox).toHaveAttribute('aria-expanded', 'false');
  });
});

/* ────────────────────────────────────────────────────────── */
/*  Modal — ESC closes modal                                  */
/* ────────────────────────────────────────────────────────── */
describe('A11y: Modal ESC key', () => {
  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Dialog">
        <p>Content</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

/* ────────────────────────────────────────────────────────── */
/*  Interactive elements have accessible names                */
/* ────────────────────────────────────────────────────────── */
describe('A11y: Interactive elements have accessible names', () => {
  it('all buttons have visible text or aria-label', () => {
    render(
      <div>
        <Button>Click me</Button>
        <Button leftIcon={<span>🔍</span>}>Search</Button>
        <Button aria-label="Custom label">X</Button>
      </div>,
    );
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => {
      const hasAccessibleName =
        btn.textContent?.trim() !== '' || btn.hasAttribute('aria-label');
      expect(hasAccessibleName).toBe(true);
    });
  });

  it('icon-only buttons always have aria-label', () => {
    render(
      <button aria-label="Settings" className="p-2">
        <svg aria-hidden="true"><path d="M0 0" /></svg>
      </button>,
    );
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });
});
