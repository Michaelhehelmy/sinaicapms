import React, { useState, useCallback, useEffect } from 'react';
import * as api from '@/lib/api';
import { DataTable } from '@/components/ui/DataTable';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils';

type Tab = 'pages' | 'blog' | 'blogCategories' | 'carts' | 'orders';

interface PageItem {
  id: string; slug: string; title: string; content: string;
  meta_title: string; meta_description: string; is_published: number;
  created_at: string; updated_at: string;
}

interface BlogPost {
  id: string; slug: string; title: string; content: string; excerpt: string;
  category: string; tags: string; author_id: string; is_published: number;
  published_at: string; created_at: string; updated_at: string;
}

interface BlogCategory {
  id: string; name: string; slug: string; created_at: string;
}

interface CartOverview {
  id: string; session_id: string; user_id: string; item_count: number;
  total: number; created_at: string;
}

interface OrderItem {
  id: string; order_number: string; customer_email: string; total_amount: number;
  status: string; payment_status: string; created_at: string;
}

interface PageForm {
  slug: string; title: string; content: string;
  metaTitle: string; metaDescription: string; isPublished: boolean;
}

interface BlogForm {
  slug: string; title: string; content: string; excerpt: string;
  category: string; tags: string; authorId: string; isPublished: boolean;
}

interface CategoryForm {
  name: string; slug: string;
}

const emptyPageForm: PageForm = { slug: '', title: '', content: '', metaTitle: '', metaDescription: '', isPublished: false };
const emptyBlogForm: BlogForm = { slug: '', title: '', content: '', excerpt: '', category: '', tags: '', authorId: '', isPublished: false };
const emptyCategoryForm: CategoryForm = { name: '', slug: '' };

export default function StorefrontPanel() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('pages');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [pages, setPages] = useState<PageItem[]>([]);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [carts, setCarts] = useState<CartOverview[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);

  const [showPageForm, setShowPageForm] = useState(false);
  const [editPageId, setEditPageId] = useState<string | null>(null);
  const [pageForm, setPageForm] = useState<PageForm>(emptyPageForm);

  const [showBlogForm, setShowBlogForm] = useState(false);
  const [editBlogId, setEditBlogId] = useState<string | null>(null);
  const [blogForm, setBlogForm] = useState<BlogForm>(emptyBlogForm);

  const [showCatForm, setShowCatForm] = useState(false);
  const [catForm, setCatForm] = useState<CategoryForm>(emptyCategoryForm);

  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string; label: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [p, b, c2, ca, o] = await Promise.all([
        api.getStorefrontPages() as Promise<PageItem[]>,
        api.getStorefrontBlogPosts() as Promise<BlogPost[]>,
        api.getStorefrontBlogCategories() as Promise<BlogCategory[]>,
        api.getStorefrontCarts() as Promise<CartOverview[]>,
        api.getStorefrontOrders() as Promise<OrderItem[]>,
      ]);
      setPages(p); setPosts(b); setCategories(c2); setCarts(ca); setOrders(o);
    } catch (err) {
      showToast('Failed to load storefront data: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [showToast]);

  useEffect(() => { loadData().finally(() => setLoading(false)); }, [loadData]);

  const openAddPage = useCallback(() => { setEditPageId(null); setPageForm(emptyPageForm); setShowPageForm(true); }, []);
  const openEditPage = useCallback((p: PageItem) => {
    setEditPageId(p.id);
    setPageForm({ slug: p.slug, title: p.title, content: p.content || '', metaTitle: p.meta_title || '', metaDescription: p.meta_description || '', isPublished: !!p.is_published });
    setShowPageForm(true);
  }, []);

  const handleSavePage = useCallback(async () => {
    if (!pageForm.title.trim()) { showToast('Title is required.', 'warning'); return; }
    if (!pageForm.slug.trim()) { showToast('Slug is required.', 'warning'); return; }
    setSaving(true);
    try {
      await api.saveStorefrontPage({
        slug: pageForm.slug.trim(),
        title: pageForm.title.trim(),
        content: pageForm.content || undefined,
        metaTitle: pageForm.metaTitle || undefined,
        metaDescription: pageForm.metaDescription || undefined,
        isPublished: pageForm.isPublished,
      }, editPageId ?? undefined);
      showToast(editPageId ? 'Page updated.' : 'Page created.', 'success');
      setShowPageForm(false); setEditPageId(null); setPageForm(emptyPageForm);
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [pageForm, editPageId, showToast, loadData]);

  const openAddBlog = useCallback(() => { setEditBlogId(null); setBlogForm(emptyBlogForm); setShowBlogForm(true); }, []);
  const openEditBlog = useCallback((p: BlogPost) => {
    setEditBlogId(p.id);
    setBlogForm({ slug: p.slug, title: p.title, content: p.content || '', excerpt: p.excerpt || '', category: p.category || '', tags: p.tags || '', authorId: p.author_id || '', isPublished: !!p.is_published });
    setShowBlogForm(true);
  }, []);

  const handleSaveBlog = useCallback(async () => {
    if (!blogForm.title.trim()) { showToast('Title is required.', 'warning'); return; }
    if (!blogForm.slug.trim()) { showToast('Slug is required.', 'warning'); return; }
    if (!blogForm.content.trim()) { showToast('Content is required.', 'warning'); return; }
    setSaving(true);
    try {
      await api.saveStorefrontBlogPost({
        slug: blogForm.slug.trim(),
        title: blogForm.title.trim(),
        content: blogForm.content.trim(),
        excerpt: blogForm.excerpt || undefined,
        category: blogForm.category || undefined,
        tags: blogForm.tags || undefined,
        authorId: blogForm.authorId || undefined,
        isPublished: blogForm.isPublished,
      }, editBlogId ?? undefined);
      showToast(editBlogId ? 'Blog post updated.' : 'Blog post created.', 'success');
      setShowBlogForm(false); setEditBlogId(null); setBlogForm(emptyBlogForm);
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [blogForm, editBlogId, showToast, loadData]);

  const openAddCat = useCallback(() => { setCatForm(emptyCategoryForm); setShowCatForm(true); }, []);

  const handleSaveCat = useCallback(async () => {
    if (!catForm.name.trim()) { showToast('Name is required.', 'warning'); return; }
    if (!catForm.slug.trim()) { showToast('Slug is required.', 'warning'); return; }
    setSaving(true);
    try {
      await api.saveStorefrontBlogCategory({ name: catForm.name.trim(), slug: catForm.slug.trim() });
      showToast('Category created.', 'success');
      setShowCatForm(false); setCatForm(emptyCategoryForm);
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [catForm, showToast, loadData]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'page') await api.deleteStorefrontPage(deleteTarget.id);
      else if (deleteTarget.type === 'blog') await api.deleteStorefrontBlogPost(deleteTarget.id);
      else if (deleteTarget.type === 'category') await api.deleteStorefrontBlogCategory(deleteTarget.id);
      showToast('Deleted.', 'success');
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [deleteTarget, showToast, loadData]);

  if (loading) return <LoadingSpinner text="Loading storefront..." />;

  return (
    <Card padding="none" className="p-6" data-testid="storefront-panel">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold text-gray-800">Storefront</h2>
        {tab === 'pages' && <Button variant="success" size="md" onClick={openAddPage}>Add Page</Button>}
        {tab === 'blog' && <Button variant="success" size="md" onClick={openAddBlog}>Add Post</Button>}
        {tab === 'blogCategories' && <Button variant="success" size="md" onClick={openAddCat}>Add Category</Button>}
      </div>
      <p className="text-sm text-gray-500 mb-4">Manage CMS pages, blog posts, and view storefront activity.</p>

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(['pages', 'blog', 'blogCategories', 'carts', 'orders'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            data-testid={`tab-${t}`}>
            {t === 'pages' ? 'Pages' : t === 'blog' ? 'Blog' : t === 'blogCategories' ? 'Categories' : t === 'carts' ? `Carts (${carts.length})` : `Orders (${orders.length})`}
          </button>
        ))}
      </div>

      {tab === 'pages' && (
        pages.length === 0 ? (
          <EmptyState title="No pages" description="Create your first CMS page." action={{ label: 'Add Page', onClick: openAddPage }} />
        ) : (
          <DataTable<PageItem & Record<string, unknown>>
            columns={[
              { key: 'title', header: 'Title', sortable: true, render: (p) => <strong className="text-gray-900">{String(p.title)}</strong> },
              { key: 'slug', header: 'Slug', render: (p) => <span className="text-sm text-gray-500 font-mono">/{String(p.slug)}</span> },
              { key: 'is_published', header: 'Status', render: (p) => <Badge variant={Number(p.is_published) === 1 ? 'success' : 'neutral'} dot size="sm">{Number(p.is_published) === 1 ? 'Published' : 'Draft'}</Badge> },
              { key: 'updated_at', header: 'Updated', render: (p) => <span className="text-sm text-gray-500">{p.updated_at ? String(p.updated_at).slice(0, 10) : '-'}</span> },
            ]}
            data={pages as (PageItem & Record<string, unknown>)[]}
            emptyMessage="No pages yet."
            actions={(p) => (
              <div className="flex gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => openEditPage(p as unknown as PageItem)}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => setDeleteTarget({ type: 'page', id: (p as unknown as PageItem).id, label: String(p.title) })}>Delete</Button>
              </div>
            )}
          />
        )
      )}

      {tab === 'blog' && (
        posts.length === 0 ? (
          <EmptyState title="No blog posts" description="Create your first blog post." action={{ label: 'Add Post', onClick: openAddBlog }} />
        ) : (
          <DataTable<BlogPost & Record<string, unknown>>
            columns={[
              { key: 'title', header: 'Title', sortable: true, render: (p) => <strong className="text-gray-900">{String(p.title)}</strong> },
              { key: 'category', header: 'Category', render: (p) => <span className="text-sm text-gray-600">{String(p.category || '-')}</span> },
              { key: 'is_published', header: 'Status', render: (p) => <Badge variant={Number(p.is_published) === 1 ? 'success' : 'neutral'} dot size="sm">{Number(p.is_published) === 1 ? 'Published' : 'Draft'}</Badge> },
              { key: 'author_id', header: 'Author', render: (p) => <span className="text-sm text-gray-500">{String(p.author_id || '-')}</span> },
            ]}
            data={posts as (BlogPost & Record<string, unknown>)[]}
            emptyMessage="No blog posts."
            actions={(p) => (
              <div className="flex gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => openEditBlog(p as unknown as BlogPost)}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => setDeleteTarget({ type: 'blog', id: (p as unknown as BlogPost).id, label: String(p.title) })}>Delete</Button>
              </div>
            )}
          />
        )
      )}

      {tab === 'blogCategories' && (
        categories.length === 0 ? (
          <EmptyState title="No categories" description="Create your first blog category." action={{ label: 'Add Category', onClick: openAddCat }} />
        ) : (
          <DataTable<BlogCategory & Record<string, unknown>>
            columns={[
              { key: 'name', header: 'Name', sortable: true, render: (c) => <strong className="text-gray-900">{String(c.name)}</strong> },
              { key: 'slug', header: 'Slug', render: (c) => <span className="text-sm text-gray-500 font-mono">{String(c.slug)}</span> },
            ]}
            data={categories as (BlogCategory & Record<string, unknown>)[]}
            emptyMessage="No categories."
            actions={(c) => (
              <Button variant="danger" size="sm" onClick={() => setDeleteTarget({ type: 'category', id: (c as unknown as BlogCategory).id, label: String(c.name) })}>Delete</Button>
            )}
          />
        )
      )}

      {tab === 'carts' && (
        carts.length === 0 ? (
          <EmptyState title="No active carts" description="Customer carts will appear here." />
        ) : (
          <DataTable<CartOverview & Record<string, unknown>>
            columns={[
              { key: 'session_id', header: 'Session', render: (c) => <span className="text-sm text-gray-600 font-mono truncate max-w-[140px] block">{String(c.session_id || c.user_id || '-')}</span> },
              { key: 'item_count', header: 'Items', render: (c) => <span className="font-medium">{String(c.item_count)}</span> },
              { key: 'total', header: 'Total', render: (c) => <span className="font-medium">{formatCurrency(Number(c.total))}</span> },
              { key: 'created_at', header: 'Created', render: (c) => <span className="text-sm text-gray-500">{c.created_at ? String(c.created_at).slice(0, 10) : '-'}</span> },
            ]}
            data={carts as (CartOverview & Record<string, unknown>)[]}
            emptyMessage="No active carts."
          />
        )
      )}

      {tab === 'orders' && (
        orders.length === 0 ? (
          <EmptyState title="No orders" description="Orders from the storefront will appear here." />
        ) : (
          <DataTable<OrderItem & Record<string, unknown>>
            columns={[
              { key: 'order_number', header: 'Order #', sortable: true, render: (o) => <strong className="text-gray-900">{String(o.order_number)}</strong> },
              { key: 'customer_email', header: 'Customer', render: (o) => <span className="text-sm text-gray-600">{String(o.customer_email || '-')}</span> },
              { key: 'total_amount', header: 'Total', render: (o) => <span className="font-medium">{formatCurrency(Number(o.total_amount))}</span> },
              { key: 'status', header: 'Status', render: (o) => <Badge variant={String(o.status) === 'completed' ? 'success' : String(o.status) === 'pending' ? 'warning' : 'neutral'} dot size="sm">{String(o.status)}</Badge> },
              { key: 'created_at', header: 'Date', render: (o) => <span className="text-sm text-gray-500">{o.created_at ? String(o.created_at).slice(0, 10) : '-'}</span> },
            ]}
            data={orders as (OrderItem & Record<string, unknown>)[]}
            emptyMessage="No orders yet."
          />
        )
      )}

      <FormModal open={showPageForm} title={editPageId ? 'Edit Page' : 'Add Page'} onClose={() => { setShowPageForm(false); setEditPageId(null); }} onSubmit={handleSavePage} submitLabel={saving ? 'Saving...' : editPageId ? 'Update' : 'Create'} submitDisabled={saving}>
        <div className="space-y-4">
          <Input label="Title *" type="text" value={pageForm.title} onChange={(e) => setPageForm((p) => ({ ...p, title: e.target.value }))} placeholder="Page title" />
          <Input label="Slug *" type="text" value={pageForm.slug} onChange={(e) => setPageForm((p) => ({ ...p, slug: e.target.value }))} placeholder="page-slug" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
            <textarea className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm min-h-[120px]" value={pageForm.content} onChange={(e) => setPageForm((p) => ({ ...p, content: e.target.value }))} placeholder="Page content (HTML)" />
          </div>
          <Input label="Meta Title" type="text" value={pageForm.metaTitle} onChange={(e) => setPageForm((p) => ({ ...p, metaTitle: e.target.value }))} placeholder="SEO title" />
          <Input label="Meta Description" type="text" value={pageForm.metaDescription} onChange={(e) => setPageForm((p) => ({ ...p, metaDescription: e.target.value }))} placeholder="SEO description" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pageForm.isPublished} onChange={(e) => setPageForm((p) => ({ ...p, isPublished: e.target.checked }))} className="rounded" />
            Published
          </label>
        </div>
      </FormModal>

      <FormModal open={showBlogForm} title={editBlogId ? 'Edit Blog Post' : 'Add Blog Post'} onClose={() => { setShowBlogForm(false); setEditBlogId(null); }} onSubmit={handleSaveBlog} submitLabel={saving ? 'Saving...' : editBlogId ? 'Update' : 'Create'} submitDisabled={saving}>
        <div className="space-y-4">
          <Input label="Title *" type="text" value={blogForm.title} onChange={(e) => setBlogForm((p) => ({ ...p, title: e.target.value }))} placeholder="Post title" />
          <Input label="Slug *" type="text" value={blogForm.slug} onChange={(e) => setBlogForm((p) => ({ ...p, slug: e.target.value }))} placeholder="post-slug" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content *</label>
            <textarea className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm min-h-[160px]" value={blogForm.content} onChange={(e) => setBlogForm((p) => ({ ...p, content: e.target.value }))} placeholder="Post content (HTML)" />
          </div>
          <Input label="Excerpt" type="text" value={blogForm.excerpt} onChange={(e) => setBlogForm((p) => ({ ...p, excerpt: e.target.value }))} placeholder="Short summary" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Category" type="text" value={blogForm.category} onChange={(e) => setBlogForm((p) => ({ ...p, category: e.target.value }))} placeholder="Category" />
            <Input label="Tags" type="text" value={blogForm.tags} onChange={(e) => setBlogForm((p) => ({ ...p, tags: e.target.value }))} placeholder="comma-separated" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={blogForm.isPublished} onChange={(e) => setBlogForm((p) => ({ ...p, isPublished: e.target.checked }))} className="rounded" />
            Published
          </label>
        </div>
      </FormModal>

      <FormModal open={showCatForm} title="Add Category" onClose={() => { setShowCatForm(false); setCatForm(emptyCategoryForm); }} onSubmit={handleSaveCat} submitLabel={saving ? 'Saving...' : 'Create'} submitDisabled={saving}>
        <div className="space-y-4">
          <Input label="Name *" type="text" value={catForm.name} onChange={(e) => setCatForm((p) => ({ ...p, name: e.target.value }))} placeholder="Category name" />
          <Input label="Slug *" type="text" value={catForm.slug} onChange={(e) => setCatForm((p) => ({ ...p, slug: e.target.value }))} placeholder="category-slug" />
        </div>
      </FormModal>

      {deleteTarget && (
        <ConfirmDialog open title={`Delete ${deleteTarget.type}`} message={`Are you sure you want to delete "${deleteTarget.label}"?`} confirmLabel="Delete" onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </Card>
  );
}
