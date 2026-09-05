import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import StorefrontPanel from '@/components/admin/StorefrontPanel';

const mockShowToast = vi.fn();
let pagesData: unknown[] = [];
let postsData: unknown[] = [];
let categoriesData: unknown[] = [];
let cartsData: unknown[] = [];
let ordersData: unknown[] = [];
let anyLoading = false;

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/api', () => ({
  saveStorefrontPage: vi.fn(),
  deleteStorefrontPage: vi.fn(),
  saveStorefrontBlogPost: vi.fn(),
  deleteStorefrontBlogPost: vi.fn(),
  saveStorefrontBlogCategory: vi.fn(),
  deleteStorefrontBlogCategory: vi.fn(),
}));

vi.mock('@/hooks/useQueryHooks', () => {
  const React = require('react');
  const useQ = (data: unknown) => {
    const [d, setD] = React.useState(data);
    const [l, setL] = React.useState(anyLoading);
    React.useEffect(() => { setD(data); setL(anyLoading); });
    return { data: d, isLoading: l };
  };
  return {
    queryKeys: { storefront: ['admin', 'storefront'] },
    useStorefrontPagesQuery: () => useQ(pagesData),
    useStorefrontBlogPostsQuery: () => useQ(postsData),
    useStorefrontBlogCategoriesQuery: () => useQ(categoriesData),
    useStorefrontCartsQuery: () => useQ(cartsData),
    useStorefrontOrdersQuery: () => useQ(ordersData),
  };
});

vi.mock('@/lib/utils', () => ({
  formatCurrency: (v: number) => `$${v.toFixed(2)}`,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: ({ text }: { text?: string }) => <div data-testid="loading-spinner">{text}</div>,
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick, disabled, ...rest }: { children: React.ReactNode; onClick?: (e?: React.MouseEvent) => void; disabled?: boolean; [key: string]: unknown }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
}));

vi.mock('@/components/ui/Input', () => ({
  Input: ({ label, value, onChange, placeholder, type }: { label?: string; value?: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string; type?: string }) => (
    <div>
      {label && <label>{label}</label>}
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} data-testid={label ? `input-${label}` : 'input'} />
    </div>
  ),
}));

vi.mock('@/components/ui/Select', () => ({
  Select: ({ label, options, value, onChange }: { label?: string; options: { value: string; label: string }[]; value?: string; onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void }) => (
    <div>
      {label && <label>{label}</label>}
      <select value={value} onChange={onChange} data-testid={label ? `select-${label}` : 'select'}>
        {options.map((opt: { value: string; label: string }) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  ),
}));

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => <div {...rest}>{children}</div>,
}));

vi.mock('@/components/ui/Badge', () => ({
  Badge: ({ children }: { children: React.ReactNode; variant?: string; size?: string; dot?: boolean }) => (
    <span data-testid="badge">{children}</span>
  ),
}));

vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: ({ title, description, action }: { title: string; description?: string; action?: { label: string; onClick: () => void } }) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <button onClick={action.onClick}>{action.label}</button>}
    </div>
  ),
}));

vi.mock('@/components/ui/DataTable', () => ({
  DataTable: ({ data, columns, emptyMessage, actions }: {
    data: unknown[];
    columns: { key: string; header: string; render?: (item: unknown) => React.ReactNode }[];
    emptyMessage?: string;
    actions?: (row: unknown) => React.ReactNode;
  }) => (
    <div data-testid="data-table">
      {data.length === 0 && emptyMessage && <p>{emptyMessage}</p>}
      {data.map((row: Record<string, unknown>, i: number) => (
        <div key={i} data-testid="data-row">
          {columns.map((col) => (
            <span key={col.key}>{col.render ? col.render(row) : String(row[col.key] ?? '')}</span>
          ))}
          {actions && <div>{actions(row)}</div>}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/ui/FormModal', () => ({
  FormModal: ({ open, title, children, onClose, onSubmit, submitLabel, submitDisabled }: {
    open: boolean; title: string; children: React.ReactNode;
    onClose?: () => void; onSubmit?: () => void; submitLabel?: string; submitDisabled?: boolean;
  }) => open ? (
    <div data-testid="form-modal">
      <h2>{title}</h2>
      {children}
      {onClose && <button data-testid="modal-close" onClick={onClose}>Close</button>}
      {onSubmit && <button data-testid="modal-submit" onClick={onSubmit} disabled={submitDisabled}>{submitLabel || 'Submit'}</button>}
    </div>
  ) : null,
}));

vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, title, message, onConfirm, onCancel }: {
    open: boolean; title: string; message?: string; onConfirm?: () => void; onCancel?: () => void;
  }) => open ? (
    <div data-testid="confirm-dialog">
      <h2>{title}</h2>
      {message && <p>{message}</p>}
      {onConfirm && <button data-testid="confirm-yes" onClick={onConfirm}>Confirm</button>}
      {onCancel && <button data-testid="confirm-no" onClick={onCancel}>Cancel</button>}
    </div>
  ) : null,
}));

import * as api from '@/lib/api';
const mockSaveStorefrontPage = vi.mocked(api.saveStorefrontPage);
const mockDeleteStorefrontPage = vi.mocked(api.deleteStorefrontPage);
const mockSaveStorefrontBlogPost = vi.mocked(api.saveStorefrontBlogPost);
const mockDeleteStorefrontBlogPost = vi.mocked(api.deleteStorefrontBlogPost);
const mockSaveStorefrontBlogCategory = vi.mocked(api.saveStorefrontBlogCategory);
const mockDeleteStorefrontBlogCategory = vi.mocked(api.deleteStorefrontBlogCategory);

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><StorefrontPanel /></QueryClientProvider>);
}

describe('StorefrontPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pagesData = [];
    postsData = [];
    categoriesData = [];
    cartsData = [];
    ordersData = [];
    anyLoading = false;
  });

  it('shows loading spinner', () => {
    anyLoading = true;
    renderPanel();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('renders with pages tab empty state', () => {
    renderPanel();
    expect(screen.getByTestId('storefront-panel')).toBeInTheDocument();
    expect(screen.getByText('Storefront')).toBeInTheDocument();
    expect(screen.getByText('No pages')).toBeInTheDocument();
  });

  // === Pages ===
  it('opens add page modal', () => {
    renderPanel();
    fireEvent.click(screen.getAllByText('Add Page')[0]);
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();
    expect(screen.getAllByText('Add Page')[0]).toBeInTheDocument();
  });

  it('closes add page modal', () => {
    renderPanel();
    fireEvent.click(screen.getAllByText('Add Page')[0]);
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
  });

  it('toggles page published checkbox', () => {
    renderPanel();
    fireEvent.click(screen.getAllByText('Add Page')[0]);
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    const published = checkboxes[0] as HTMLInputElement;
    fireEvent.click(published);
    expect(published.checked).toBe(true);
  });

  it('validates page title required', async () => {
    renderPanel();
    fireEvent.click(screen.getAllByText('Add Page')[0]);
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Title is required.', 'warning');
    });
  });

  it('validates page slug required', async () => {
    renderPanel();
    fireEvent.click(screen.getAllByText('Add Page')[0]);
    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'About' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Slug is required.', 'warning');
    });
  });

  it('creates page successfully', async () => {
    mockSaveStorefrontPage.mockResolvedValue({} as never);
    renderPanel();
    fireEvent.click(screen.getAllByText('Add Page')[0]);
    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'About Us' } });
    fireEvent.change(screen.getByTestId('input-Slug *'), { target: { value: 'about' } });
    const pageTextarea = document.querySelectorAll('textarea')[0] as HTMLTextAreaElement;
    fireEvent.change(pageTextarea, { target: { value: '<p>About content</p>' } });
    fireEvent.change(screen.getByTestId('input-Meta Title'), { target: { value: 'About SEO' } });
    fireEvent.change(screen.getByTestId('input-Meta Description'), { target: { value: 'About description' } });
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(checkboxes[0] as HTMLInputElement);
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockSaveStorefrontPage).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Page created.', 'success');
    });
  });

  it('page creation error shows toast', async () => {
    mockSaveStorefrontPage.mockRejectedValue(new Error('page fail'));
    renderPanel();
    fireEvent.click(screen.getAllByText('Add Page')[0]);
    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'About' } });
    fireEvent.change(screen.getByTestId('input-Slug *'), { target: { value: 'about' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error'), 'error');
    });
  });

  it('renders pages with data and edits page', async () => {
    pagesData = [{ id: 'p1', slug: 'home', title: 'Home', content: '', meta_title: '', meta_description: '', is_published: 1, created_at: '2025-01-01', updated_at: '2025-01-02' }];
    mockSaveStorefrontPage.mockResolvedValue({} as never);
    renderPanel();
    expect(screen.getByText('Home')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByText('Edit Page')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Page updated.', 'success');
    });
  });

  it('deletes page via confirm dialog', async () => {
    pagesData = [{ id: 'p1', slug: 'home', title: 'Home', content: '', meta_title: '', meta_description: '', is_published: 1, created_at: '2025-01-01', updated_at: '2025-01-02' }];
    mockDeleteStorefrontPage.mockResolvedValue({} as never);
    renderPanel();
    fireEvent.click(screen.getByText('Delete'));
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockDeleteStorefrontPage).toHaveBeenCalledWith('p1');
      expect(mockShowToast).toHaveBeenCalledWith('Deleted.', 'success');
    });
  });

  it('cancel delete does nothing', async () => {
    pagesData = [{ id: 'p1', slug: 'home', title: 'Home', content: '', meta_title: '', meta_description: '', is_published: 1, created_at: '2025-01-01', updated_at: '2025-01-02' }];
    renderPanel();
    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByTestId('confirm-no'));
    expect(mockDeleteStorefrontPage).not.toHaveBeenCalled();
  });

  // === Blog ===
  it('switches to blog tab with empty state', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-blog'));
    expect(screen.getByText('No blog posts')).toBeInTheDocument();
  });

  it('opens add blog post modal', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-blog'));
    fireEvent.click(screen.getAllByText('Add Post')[0]);
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();
  });

  it('closes add blog post modal', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-blog'));
    fireEvent.click(screen.getAllByText('Add Post')[0]);
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
  });

  it('toggles blog published checkbox', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-blog'));
    fireEvent.click(screen.getAllByText('Add Post')[0]);
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    const published = checkboxes[0] as HTMLInputElement;
    fireEvent.click(published);
    expect(published.checked).toBe(true);
  });

  it('validates blog title required', async () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-blog'));
    fireEvent.click(screen.getAllByText('Add Post')[0]);
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Title is required.', 'warning');
    });
  });

  it('validates blog slug required', async () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-blog'));
    fireEvent.click(screen.getAllByText('Add Post')[0]);
    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'My Post' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Slug is required.', 'warning');
    });
  });

  it('validates blog content required', async () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-blog'));
    fireEvent.click(screen.getAllByText('Add Post')[0]);
    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'My Post' } });
    fireEvent.change(screen.getByTestId('input-Slug *'), { target: { value: 'my-post' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Content is required.', 'warning');
    });
  });

  it('creates blog post successfully', async () => {
    mockSaveStorefrontBlogPost.mockResolvedValue({} as never);
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-blog'));
    fireEvent.click(screen.getAllByText('Add Post')[0]);
    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'My Post' } });
    fireEvent.change(screen.getByTestId('input-Slug *'), { target: { value: 'my-post' } });
    // Content is a textarea, not the Input mock
    const textarea = document.querySelector('textarea');
    if (textarea) fireEvent.change(textarea, { target: { value: 'Post content here' } });
    fireEvent.change(screen.getByTestId('input-Excerpt'), { target: { value: 'Short summary' } });
    fireEvent.change(screen.getByTestId('input-Category'), { target: { value: 'news' } });
    fireEvent.change(screen.getByTestId('input-Tags'), { target: { value: 'tag1,tag2' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockSaveStorefrontBlogPost).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Blog post created.', 'success');
    });
  });

  it('blog creation error shows toast', async () => {
    mockSaveStorefrontBlogPost.mockRejectedValue(new Error('blog fail'));
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-blog'));
    fireEvent.click(screen.getAllByText('Add Post')[0]);
    fireEvent.change(screen.getByTestId('input-Title *'), { target: { value: 'Post' } });
    fireEvent.change(screen.getByTestId('input-Slug *'), { target: { value: 'post' } });
    const textarea = document.querySelector('textarea');
    if (textarea) fireEvent.change(textarea, { target: { value: 'Content' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error'), 'error');
    });
  });

  it('edits and deletes blog post', async () => {
    postsData = [{ id: 'bp1', slug: 'hello', title: 'Hello World', content: 'Hi', excerpt: '', category: 'news', tags: '', author_id: 'u1', is_published: 1, published_at: '', created_at: '', updated_at: '' }];
    mockSaveStorefrontBlogPost.mockResolvedValue({} as never);
    mockDeleteStorefrontBlogPost.mockResolvedValue({} as never);
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-blog'));
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByText('Edit Blog Post')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Blog post updated.', 'success');
    });

    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockDeleteStorefrontBlogPost).toHaveBeenCalledWith('bp1');
      expect(mockShowToast).toHaveBeenCalledWith('Deleted.', 'success');
    });
  });

  // === Blog Categories ===
  it('switches to categories tab with empty state', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-blogCategories'));
    expect(screen.getByText('No categories')).toBeInTheDocument();
  });

  it('opens add category modal', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-blogCategories'));
    fireEvent.click(screen.getAllByText('Add Category')[0]);
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();
  });

  it('closes add category modal', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-blogCategories'));
    fireEvent.click(screen.getAllByText('Add Category')[0]);
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
  });

  it('delete error shows toast', async () => {
    pagesData = [{ id: 'p1', slug: 'home', title: 'Home', content: '', meta_title: '', meta_description: '', is_published: 1, created_at: '2025-01-01', updated_at: '2025-01-02' }];
    mockDeleteStorefrontPage.mockRejectedValue(new Error('delete fail'));
    renderPanel();
    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error'), 'error');
    });
  });

  it('validates category name required', async () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-blogCategories'));
    fireEvent.click(screen.getAllByText('Add Category')[0]);
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Name is required.', 'warning');
    });
  });

  it('validates category slug required', async () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-blogCategories'));
    fireEvent.click(screen.getAllByText('Add Category')[0]);
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'News' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Slug is required.', 'warning');
    });
  });

  it('creates category successfully', async () => {
    mockSaveStorefrontBlogCategory.mockResolvedValue({} as never);
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-blogCategories'));
    fireEvent.click(screen.getAllByText('Add Category')[0]);
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'News' } });
    fireEvent.change(screen.getByTestId('input-Slug *'), { target: { value: 'news' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockSaveStorefrontBlogCategory).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Category created.', 'success');
    });
  });

  it('category creation error shows toast', async () => {
    mockSaveStorefrontBlogCategory.mockRejectedValue(new Error('cat fail'));
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-blogCategories'));
    fireEvent.click(screen.getAllByText('Add Category')[0]);
    fireEvent.change(screen.getByTestId('input-Name *'), { target: { value: 'Cat' } });
    fireEvent.change(screen.getByTestId('input-Slug *'), { target: { value: 'cat' } });
    fireEvent.click(screen.getByTestId('modal-submit'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error'), 'error');
    });
  });

  it('deletes category', async () => {
    categoriesData = [{ id: 'c1', name: 'Tech', slug: 'tech', created_at: '2025-01-01' }];
    mockDeleteStorefrontBlogCategory.mockResolvedValue({} as never);
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-blogCategories'));
    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => {
      expect(mockDeleteStorefrontBlogCategory).toHaveBeenCalledWith('c1');
      expect(mockShowToast).toHaveBeenCalledWith('Deleted.', 'success');
    });
  });

  it('renders categories with data', () => {
    categoriesData = [{ id: 'c1', name: 'Tech', slug: 'tech', created_at: '2025-01-01' }];
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-blogCategories'));
    expect(screen.getByText('Tech')).toBeInTheDocument();
  });

  // === Carts ===
  it('switches to carts tab with empty state', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-carts'));
    expect(screen.getByText('No active carts')).toBeInTheDocument();
  });

  it('renders carts with data', () => {
    cartsData = [{ id: 'cart1', session_id: 'sess1', user_id: '', item_count: 3, total: 150, created_at: '2025-01-01T00:00:00Z' }];
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-carts'));
    expect(screen.getByText('sess1')).toBeInTheDocument();
  });

  // === Orders ===
  it('switches to orders tab with empty state', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-orders'));
    expect(screen.getByText('No orders')).toBeInTheDocument();
  });

  it('renders orders with data', () => {
    ordersData = [{ id: 'o1', order_number: 'ORD001', customer_email: 'test@test.com', total_amount: 200, status: 'completed', payment_status: 'paid', created_at: '2025-01-01T00:00:00Z' }];
    renderPanel();
    fireEvent.click(screen.getByTestId('tab-orders'));
    expect(screen.getByText('ORD001')).toBeInTheDocument();
  });

  // === Tab labels ===
  it('shows tab labels with counts', () => {
    ordersData = [{ id: 'o1', order_number: 'ORD001', customer_email: '', total_amount: 0, status: 'pending', payment_status: '', created_at: '' }];
    cartsData = [{ id: 'c1', session_id: '', user_id: '', item_count: 0, total: 0, created_at: '' }];
    renderPanel();
    expect(screen.getByText('Carts (1)')).toBeInTheDocument();
    expect(screen.getByText('Orders (1)')).toBeInTheDocument();
  });
});
