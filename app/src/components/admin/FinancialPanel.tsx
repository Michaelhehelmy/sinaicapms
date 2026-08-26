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

type Tab = 'accounts' | 'journals' | 'invoices' | 'payments' | 'taxes';

interface Account { id: string; code: string; name: string; type: string; is_active: number | boolean; parent_id: string | null; }
interface Journal { id: string; name: string; type: string; sequence_next: number; is_active: number | boolean; }
interface JournalEntry { id: string; journal_id: string; journal_name: string; date: string; description: string; reference: string; posted: number | boolean; lines: EntryLine[]; }
interface EntryLine { id: string; account_id: string; account_name: string; account_code: string; debit: number; credit: number; }
interface Invoice { id: string; invoice_number: string; type: string; contact_id: string | null; issue_date: string; due_date: string | null; total_amount: number; paid_amount: number; status: string; currency: string; }
interface Payment { id: string; invoice_id: string | null; amount: number; payment_date: string; method: string; status: string; reference: string | null; }
interface TaxRate { id: string; name: string; rate: number; jurisdiction: string | null; is_default: number | boolean; }

// ─── Account Form ───────────────────────────────────────────
interface AccountForm { code: string; name: string; type: string; parentId: string; }
const emptyAccountForm: AccountForm = { code: '', name: '', type: 'asset', parentId: '' };

// ─── Journal Form ───────────────────────────────────────────
interface JournalForm { name: string; type: string; }
const emptyJournalForm: JournalForm = { name: '', type: 'general' };

// ─── Entry Form ─────────────────────────────────────────────
interface EntryForm { journalId: string; date: string; description: string; reference: string; lines: { accountId: string; debit: string; credit: string; }[]; }
const emptyEntryForm: EntryForm = { journalId: '', date: new Date().toISOString().slice(0, 10), description: '', reference: '', lines: [{ accountId: '', debit: '', credit: '' }, { accountId: '', debit: '', credit: '' }] };

// ─── Invoice Form ───────────────────────────────────────────
interface InvoiceForm { type: string; contactId: string; issueDate: string; dueDate: string; currency: string; notes: string; lines: { description: string; quantity: string; unitPrice: string; taxRate: string; }[]; }
const emptyInvoiceForm: InvoiceForm = { type: 'sales', contactId: '', issueDate: new Date().toISOString().slice(0, 10), dueDate: '', currency: 'USD', notes: '', lines: [{ description: '', quantity: '1', unitPrice: '', taxRate: '0' }] };

// ─── Payment Form ───────────────────────────────────────────
interface PaymentForm { invoiceId: string; amount: string; paymentDate: string; method: string; reference: string; }
const emptyPaymentForm: PaymentForm = { invoiceId: '', amount: '', paymentDate: new Date().toISOString().slice(0, 10), method: 'cash', reference: '' };

// ─── Tax Rate Form ──────────────────────────────────────────
interface TaxRateForm { name: string; rate: string; jurisdiction: string; isDefault: boolean; }
const emptyTaxRateForm: TaxRateForm = { name: '', rate: '', jurisdiction: '', isDefault: false };

const ACCOUNT_TYPES = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'expense', label: 'Expense' },
];

const JOURNAL_TYPES = [
  { value: 'sales', label: 'Sales' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'general', label: 'General' },
];

const INVOICE_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'canceled', label: 'Canceled' },
];

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'other', label: 'Other' },
];

const TYPE_BADGE: Record<string, { variant: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  draft: { variant: 'neutral' },
  sent: { variant: 'info' },
  paid: { variant: 'success' },
  overdue: { variant: 'danger' },
  canceled: { variant: 'danger' },
  posted: { variant: 'success' },
  pending: { variant: 'warning' },
  completed: { variant: 'success' },
  failed: { variant: 'danger' },
};

export default function FinancialPanel() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('accounts');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);

  // Account modal
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState<AccountForm>(emptyAccountForm);

  // Journal modal
  const [showJournalForm, setShowJournalForm] = useState(false);
  const [journalForm, setJournalForm] = useState<JournalForm>(emptyJournalForm);

  // Entry modal
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [entryForm, setEntryForm] = useState<EntryForm>(emptyEntryForm);

  // Invoice modal
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState<InvoiceForm>(emptyInvoiceForm);

  // Payment modal
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(emptyPaymentForm);

  // Tax rate modal
  const [showTaxRateForm, setShowTaxRateForm] = useState(false);
  const [editingTaxRateId, setEditingTaxRateId] = useState<string | null>(null);
  const [taxRateForm, setTaxRateForm] = useState<TaxRateForm>(emptyTaxRateForm);

  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [a, j, e, i, p, t] = await Promise.all([
        api.getFinancialAccounts() as Promise<Account[]>,
        api.getFinancialJournals() as Promise<Journal[]>,
        api.getFinancialJournalEntries() as Promise<JournalEntry[]>,
        api.getFinancialInvoices() as Promise<Invoice[]>,
        api.getFinancialPayments() as Promise<Payment[]>,
        api.getFinancialTaxRates() as Promise<TaxRate[]>,
      ]);
      setAccounts(a);
      setJournals(j);
      setEntries(e);
      setInvoices(i);
      setPayments(p);
      setTaxRates(t);
    } catch (err) {
      showToast('Failed to load financial data: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [showToast]);

  useEffect(() => { loadData().finally(() => setLoading(false)); }, [loadData]);

  // ── Account handlers ──────────────────────────────────────
  const openAddAccount = useCallback(() => { setEditingAccountId(null); setAccountForm(emptyAccountForm); setShowAccountForm(true); }, []);
  const openEditAccount = useCallback((a: Account) => {
    setEditingAccountId(a.id);
    setAccountForm({ code: a.code, name: a.name, type: a.type, parentId: a.parent_id || '' });
    setShowAccountForm(true);
  }, []);

  const handleSaveAccount = useCallback(async () => {
    if (!accountForm.code.trim() || !accountForm.name.trim()) { showToast('Code and name are required.', 'warning'); return; }
    setSaving(true);
    try {
      if (editingAccountId) {
        await api.saveFinancialAccount({
          code: accountForm.code.trim(),
          name: accountForm.name.trim(),
          type: accountForm.type,
          parentId: accountForm.parentId || null,
        }, editingAccountId);
      } else {
        await api.saveFinancialAccount({
          code: accountForm.code.trim(),
          name: accountForm.name.trim(),
          type: accountForm.type,
          parentId: accountForm.parentId || null,
        });
      }
      showToast(editingAccountId ? 'Account updated.' : 'Account created.', 'success');
      setShowAccountForm(false);
      setEditingAccountId(null);
      setAccountForm(emptyAccountForm);
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [accountForm, editingAccountId, showToast, loadData]);

  const handleDeleteAccount = useCallback(async (id: string) => {
    try {
      await api.deleteFinancialAccount(id);
      showToast('Account deactivated.', 'success');
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [showToast, loadData]);

  // ── Journal handlers ──────────────────────────────────────
  const handleSaveJournal = useCallback(async () => {
    if (!journalForm.name.trim()) { showToast('Name is required.', 'warning'); return; }
    setSaving(true);
    try {
      await api.saveFinancialJournal({ name: journalForm.name.trim(), type: journalForm.type });
      showToast('Journal created.', 'success');
      setShowJournalForm(false);
      setJournalForm(emptyJournalForm);
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [journalForm, showToast, loadData]);

  // ── Entry handlers ────────────────────────────────────────
  const handleSaveEntry = useCallback(async () => {
    if (!entryForm.journalId) { showToast('Journal is required.', 'warning'); return; }
    const lines = entryForm.lines
      .filter((l) => l.accountId && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
      .map((l) => ({ accountId: l.accountId, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0 }));
    if (lines.length < 2) { showToast('At least 2 lines required.', 'warning'); return; }
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.001) { showToast('Debits must equal credits.', 'warning'); return; }
    setSaving(true);
    try {
      await api.saveFinancialJournalEntry({
        journalId: entryForm.journalId,
        date: entryForm.date,
        description: entryForm.description || undefined,
        reference: entryForm.reference || undefined,
        lines,
      });
      showToast('Journal entry created.', 'success');
      setShowEntryForm(false);
      setEntryForm(emptyEntryForm);
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [entryForm, showToast, loadData]);

  const handlePostEntry = useCallback(async (id: string) => {
    try {
      await api.postFinancialJournalEntry(id);
      showToast('Entry posted.', 'success');
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [showToast, loadData]);

  // ── Invoice handlers ──────────────────────────────────────
  const handleSaveInvoice = useCallback(async () => {
    const lines = invoiceForm.lines
      .filter((l) => l.description.trim() && parseFloat(l.unitPrice) > 0)
      .map((l) => ({
        description: l.description.trim(),
        quantity: parseInt(l.quantity) || 1,
        unitPrice: parseFloat(l.unitPrice) || 0,
        taxRate: parseFloat(l.taxRate) || 0,
      }));
    if (lines.length === 0) { showToast('At least one line item required.', 'warning'); return; }
    setSaving(true);
    try {
      await api.saveFinancialInvoice({
        type: invoiceForm.type,
        contactId: invoiceForm.contactId || null,
        issueDate: invoiceForm.issueDate,
        dueDate: invoiceForm.dueDate || null,
        currency: invoiceForm.currency || 'USD',
        notes: invoiceForm.notes || undefined,
        lines,
      });
      showToast('Invoice created.', 'success');
      setShowInvoiceForm(false);
      setInvoiceForm(emptyInvoiceForm);
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [invoiceForm, showToast, loadData]);

  const handleUpdateInvoiceStatus = useCallback(async (id: string, status: string) => {
    try {
      await api.updateFinancialInvoiceStatus(id, status);
      showToast(`Invoice marked as ${status}.`, 'success');
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [showToast, loadData]);

  // ── Payment handlers ──────────────────────────────────────
  const handleSavePayment = useCallback(async () => {
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) { showToast('Amount is required.', 'warning'); return; }
    setSaving(true);
    try {
      await api.saveFinancialPayment({
        invoiceId: paymentForm.invoiceId || null,
        amount: parseFloat(paymentForm.amount),
        paymentDate: paymentForm.paymentDate,
        method: paymentForm.method,
        reference: paymentForm.reference || undefined,
      });
      showToast('Payment recorded.', 'success');
      setShowPaymentForm(false);
      setPaymentForm(emptyPaymentForm);
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [paymentForm, showToast, loadData]);

  // ── Tax rate handlers ─────────────────────────────────────
  const handleSaveTaxRate = useCallback(async () => {
    if (!taxRateForm.name.trim() || !taxRateForm.rate) { showToast('Name and rate are required.', 'warning'); return; }
    setSaving(true);
    try {
      await api.saveFinancialTaxRate({
        name: taxRateForm.name.trim(),
        rate: parseFloat(taxRateForm.rate),
        jurisdiction: taxRateForm.jurisdiction || undefined,
        isDefault: taxRateForm.isDefault,
      }, editingTaxRateId ?? undefined);
      showToast(editingTaxRateId ? 'Tax rate updated.' : 'Tax rate created.', 'success');
      setShowTaxRateForm(false);
      setEditingTaxRateId(null);
      setTaxRateForm(emptyTaxRateForm);
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [taxRateForm, editingTaxRateId, showToast, loadData]);

  if (loading) return <LoadingSpinner text="Loading financial data..." />;

  return (
    <Card padding="none" className="p-6" data-testid="financial-panel">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold text-gray-800">Financial Management</h2>
        {tab === 'accounts' && <Button variant="success" size="md" onClick={openAddAccount}>Add Account</Button>}
        {tab === 'journals' && <Button variant="success" size="md" onClick={() => { setEntryForm(emptyEntryForm); setShowEntryForm(true); }}>New Entry</Button>}
        {tab === 'invoices' && <Button variant="success" size="md" onClick={() => { setInvoiceForm(emptyInvoiceForm); setShowInvoiceForm(true); }}>New Invoice</Button>}
        {tab === 'payments' && <Button variant="success" size="md" onClick={() => { setPaymentForm(emptyPaymentForm); setShowPaymentForm(true); }}>Record Payment</Button>}
        {tab === 'taxes' && <Button variant="success" size="md" onClick={() => { setEditingTaxRateId(null); setTaxRateForm(emptyTaxRateForm); setShowTaxRateForm(true); }}>Add Tax Rate</Button>}
      </div>
      <p className="text-sm text-gray-500 mb-4">Double-entry accounting, invoicing, payments, and tax management.</p>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(['accounts', 'journals', 'invoices', 'payments', 'taxes'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            data-testid={`tab-${t}`}>
            {t === 'accounts' ? 'Chart of Accounts' : t === 'journals' ? 'Journal Entries' : t === 'invoices' ? 'Invoices' : t === 'payments' ? 'Payments' : 'Tax Rates'}
          </button>
        ))}
      </div>

      {/* ── Accounts Tab ──────────────────────────────────── */}
      {tab === 'accounts' && (
        accounts.length === 0 ? (
          <EmptyState title="No accounts" description="Set up your chart of accounts to start tracking finances." action={{ label: 'Add Account', onClick: openAddAccount }} />
        ) : (
          <DataTable<Account & Record<string, unknown>>
            columns={[
              { key: 'code', header: 'Code', sortable: true, render: (a) => <span className="font-mono text-sm">{String(a.code)}</span> },
              { key: 'name', header: 'Name', sortable: true, render: (a) => <strong className="text-gray-900">{String(a.name)}</strong> },
              { key: 'type', header: 'Type', render: (a) => <Badge variant="info" size="sm">{String(a.type)}</Badge> },
              { key: 'is_active', header: 'Status', render: (a) => <Badge variant={Number(a.is_active) === 1 ? 'success' : 'neutral'} dot size="sm">{Number(a.is_active) === 1 ? 'Active' : 'Inactive'}</Badge> },
            ]}
            data={accounts as (Account & Record<string, unknown>)[]}
            emptyMessage="No accounts configured."
            actions={(a) => (
              <div className="flex gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => openEditAccount(a as unknown as Account)}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => handleDeleteAccount((a as unknown as Account).id)}>Deactivate</Button>
              </div>
            )}
          />
        )
      )}

      {/* ── Journals Tab ──────────────────────────────────── */}
      {tab === 'journals' && (
        entries.length === 0 ? (
          <EmptyState title="No journal entries" description="Create your first journal entry." action={{ label: 'New Entry', onClick: () => { setEntryForm(emptyEntryForm); setShowEntryForm(true); } }} />
        ) : (
          <DataTable<JournalEntry & Record<string, unknown>>
            columns={[
              { key: 'date', header: 'Date', sortable: true, render: (e) => <span className="text-sm">{String(e.date).slice(0, 10)}</span> },
              { key: 'description', header: 'Description', render: (e) => <span className="text-sm text-gray-600">{String(e.description || '-')}</span> },
              { key: 'reference', header: 'Reference', render: (e) => <span className="text-sm text-gray-600">{String(e.reference || '-')}</span> },
              { key: 'journal_name', header: 'Journal', render: (e) => <span className="text-sm">{String(e.journal_name || '')}</span> },
              { key: 'posted', header: 'Status', render: (e) => <Badge variant={Number(e.posted) === 1 ? 'success' : 'neutral'} dot size="sm">{Number(e.posted) === 1 ? 'Posted' : 'Draft'}</Badge> },
            ]}
            data={entries as (JournalEntry & Record<string, unknown>)[]}
            emptyMessage="No journal entries."
            actions={(e) => (
              Number((e as unknown as JournalEntry).posted) === 0 ? (
                <Button variant="ghost" size="sm" onClick={() => handlePostEntry((e as unknown as JournalEntry).id)}>Post</Button>
              ) : <span />
            )}
          />
        )
      )}

      {/* ── Invoices Tab ──────────────────────────────────── */}
      {tab === 'invoices' && (
        invoices.length === 0 ? (
          <EmptyState title="No invoices" description="Create your first invoice." action={{ label: 'New Invoice', onClick: () => { setInvoiceForm(emptyInvoiceForm); setShowInvoiceForm(true); } }} />
        ) : (
          <DataTable<Invoice & Record<string, unknown>>
            columns={[
              { key: 'invoice_number', header: '#', sortable: true, render: (i) => <span className="font-mono text-sm">{String(i.invoice_number)}</span> },
              { key: 'type', header: 'Type', render: (i) => <Badge variant="info" size="sm">{String(i.type)}</Badge> },
              { key: 'total_amount', header: 'Amount', render: (i) => <span className="font-medium">{formatCurrency(Number(i.total_amount))}</span> },
              { key: 'status', header: 'Status', render: (i) => { const s = TYPE_BADGE[String(i.status)] || { variant: 'neutral' as const }; return <Badge variant={s.variant} dot size="sm">{String(i.status)}</Badge>; } },
            ]}
            data={invoices as (Invoice & Record<string, unknown>)[]}
            emptyMessage="No invoices."
            actions={(i) => {
              const inv = i as unknown as Invoice;
              return (
                <div className="flex gap-1.5">
                  {inv.status === 'draft' && <Button variant="ghost" size="sm" onClick={() => handleUpdateInvoiceStatus(inv.id, 'sent')}>Send</Button>}
                  {inv.status === 'sent' && <Button variant="ghost" size="sm" onClick={() => handleUpdateInvoiceStatus(inv.id, 'paid')}>Mark Paid</Button>}
                </div>
              );
            }}
          />
        )
      )}

      {/* ── Payments Tab ──────────────────────────────────── */}
      {tab === 'payments' && (
        payments.length === 0 ? (
          <EmptyState title="No payments" description="Record your first payment." action={{ label: 'Record Payment', onClick: () => { setPaymentForm(emptyPaymentForm); setShowPaymentForm(true); } }} />
        ) : (
          <DataTable<Payment & Record<string, unknown>>
            columns={[
              { key: 'payment_date', header: 'Date', sortable: true, render: (p) => <span className="text-sm">{String(p.payment_date).slice(0, 10)}</span> },
              { key: 'amount', header: 'Amount', render: (p) => <span className="font-medium">{formatCurrency(Number(p.amount))}</span> },
              { key: 'method', header: 'Method', render: (p) => <span className="text-sm capitalize">{String(p.method).replace('_', ' ')}</span> },
              { key: 'status', header: 'Status', render: (p) => { const s = TYPE_BADGE[String(p.status)] || { variant: 'neutral' as const }; return <Badge variant={s.variant} dot size="sm">{String(p.status)}</Badge>; } },
            ]}
            data={payments as (Payment & Record<string, unknown>)[]}
            emptyMessage="No payments recorded."
          />
        )
      )}

      {/* ── Tax Rates Tab ─────────────────────────────────── */}
      {tab === 'taxes' && (
        taxRates.length === 0 ? (
          <EmptyState title="No tax rates" description="Add tax rates for your jurisdiction." action={{ label: 'Add Tax Rate', onClick: () => { setEditingTaxRateId(null); setTaxRateForm(emptyTaxRateForm); setShowTaxRateForm(true); } }} />
        ) : (
          <DataTable<TaxRate & Record<string, unknown>>
            columns={[
              { key: 'name', header: 'Name', sortable: true, render: (t) => <strong className="text-gray-900">{String(t.name)}</strong> },
              { key: 'rate', header: 'Rate', render: (t) => <span className="font-medium">{Number(t.rate)}%</span> },
              { key: 'jurisdiction', header: 'Jurisdiction', render: (t) => <span className="text-sm text-gray-600">{String(t.jurisdiction || '-')}</span> },
              { key: 'is_default', header: 'Default', render: (t) => Number(t.is_default) === 1 ? <Badge variant="success" size="sm">Default</Badge> : <span /> },
            ]}
            data={taxRates as (TaxRate & Record<string, unknown>)[]}
            emptyMessage="No tax rates."
            actions={(t) => (
              <Button variant="ghost" size="sm" onClick={() => {
                const tr = t as unknown as TaxRate;
                setEditingTaxRateId(tr.id);
                setTaxRateForm({ name: tr.name, rate: String(tr.rate), jurisdiction: tr.jurisdiction || '', isDefault: Number(tr.is_default) === 1 });
                setShowTaxRateForm(true);
              }}>Edit</Button>
            )}
          />
        )
      )}

      {/* ── Account Form Modal ────────────────────────────── */}
      <FormModal open={showAccountForm} title={editingAccountId ? 'Edit Account' : 'New Account'} onClose={() => { setShowAccountForm(false); setEditingAccountId(null); }} onSubmit={handleSaveAccount} submitLabel={saving ? 'Saving...' : editingAccountId ? 'Update' : 'Create'} submitDisabled={saving}>
        <div className="space-y-4">
          <Input label="Code *" type="text" value={accountForm.code} onChange={(e) => setAccountForm((p) => ({ ...p, code: e.target.value }))} placeholder="e.g. 1000" />
          <Input label="Name *" type="text" value={accountForm.name} onChange={(e) => setAccountForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Cash" />
          <Select label="Type *" options={ACCOUNT_TYPES} value={accountForm.type} onChange={(e) => setAccountForm((p) => ({ ...p, type: e.target.value }))} />
        </div>
      </FormModal>

      {/* ── Journal Form Modal ────────────────────────────── */}
      <FormModal open={showJournalForm} title="New Journal" onClose={() => setShowJournalForm(false)} onSubmit={handleSaveJournal} submitLabel={saving ? 'Saving...' : 'Create'} submitDisabled={saving}>
        <div className="space-y-4">
          <Input label="Name *" type="text" value={journalForm.name} onChange={(e) => setJournalForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Sales Journal" />
          <Select label="Type *" options={JOURNAL_TYPES} value={journalForm.type} onChange={(e) => setJournalForm((p) => ({ ...p, type: e.target.value }))} />
        </div>
      </FormModal>

      {/* ── Entry Form Modal ──────────────────────────────── */}
      <FormModal open={showEntryForm} title="New Journal Entry" onClose={() => setShowEntryForm(false)} onSubmit={handleSaveEntry} submitLabel={saving ? 'Saving...' : 'Create'} submitDisabled={saving}>
        <div className="space-y-4">
          <Select label="Journal *" options={journals.filter((j) => Number(j.is_active) === 1).map((j) => ({ value: j.id, label: j.name }))} value={entryForm.journalId} onChange={(e) => setEntryForm((p) => ({ ...p, journalId: e.target.value }))} />
          <Input label="Date *" type="date" value={entryForm.date} onChange={(e) => setEntryForm((p) => ({ ...p, date: e.target.value }))} />
          <Input label="Description" type="text" value={entryForm.description} onChange={(e) => setEntryForm((p) => ({ ...p, description: e.target.value }))} />
          <Input label="Reference" type="text" value={entryForm.reference} onChange={(e) => setEntryForm((p) => ({ ...p, reference: e.target.value }))} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lines *</label>
            {entryForm.lines.map((line, idx) => (
              <div key={idx} className="flex gap-2 mb-2 items-end">
                <div className="flex-1">
                  <Select options={accounts.filter((a) => Number(a.is_active) === 1).map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` }))} value={line.accountId} onChange={(e) => {
                    const lines = [...entryForm.lines]; lines[idx] = { ...lines[idx], accountId: e.target.value }; setEntryForm((p) => ({ ...p, lines }));
                  }} />
                </div>
                <Input type="number" value={line.debit} onChange={(e) => {
                  const lines = [...entryForm.lines]; lines[idx] = { ...lines[idx], debit: e.target.value, credit: '' }; setEntryForm((p) => ({ ...p, lines }));
                }} placeholder="Debit" />
                <Input type="number" value={line.credit} onChange={(e) => {
                  const lines = [...entryForm.lines]; lines[idx] = { ...lines[idx], credit: e.target.value, debit: '' }; setEntryForm((p) => ({ ...p, lines }));
                }} placeholder="Credit" />
                {idx >= 2 && <Button variant="ghost" size="sm" onClick={() => {
                  const lines = entryForm.lines.filter((_, i) => i !== idx); setEntryForm((p) => ({ ...p, lines }));
                }}>x</Button>}
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => {
              setEntryForm((p) => ({ ...p, lines: [...p.lines, { accountId: '', debit: '', credit: '' }] }));
            }}>+ Add Line</Button>
          </div>
        </div>
      </FormModal>

      {/* ── Invoice Form Modal ────────────────────────────── */}
      <FormModal open={showInvoiceForm} title="New Invoice" onClose={() => setShowInvoiceForm(false)} onSubmit={handleSaveInvoice} submitLabel={saving ? 'Saving...' : 'Create'} submitDisabled={saving}>
        <div className="space-y-4">
          <Select label="Type *" options={[{ value: 'sales', label: 'Sales' }, { value: 'purchase', label: 'Purchase' }]} value={invoiceForm.type} onChange={(e) => setInvoiceForm((p) => ({ ...p, type: e.target.value }))} />
          <Input label="Issue Date *" type="date" value={invoiceForm.issueDate} onChange={(e) => setInvoiceForm((p) => ({ ...p, issueDate: e.target.value }))} />
          <Input label="Due Date" type="date" value={invoiceForm.dueDate} onChange={(e) => setInvoiceForm((p) => ({ ...p, dueDate: e.target.value }))} />
          <Input label="Currency" type="text" value={invoiceForm.currency} onChange={(e) => setInvoiceForm((p) => ({ ...p, currency: e.target.value }))} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Line Items *</label>
            {invoiceForm.lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-4 gap-2 mb-2 items-end">
                <div className="col-span-2">
                  <Input type="text" value={line.description} onChange={(e) => {
                    const lines = [...invoiceForm.lines]; lines[idx] = { ...lines[idx], description: e.target.value }; setInvoiceForm((p) => ({ ...p, lines }));
                  }} placeholder="Description" />
                </div>
                <Input type="number" value={line.quantity} onChange={(e) => {
                  const lines = [...invoiceForm.lines]; lines[idx] = { ...lines[idx], quantity: e.target.value }; setInvoiceForm((p) => ({ ...p, lines }));
                }} placeholder="Qty" />
                <Input type="number" value={line.unitPrice} onChange={(e) => {
                  const lines = [...invoiceForm.lines]; lines[idx] = { ...lines[idx], unitPrice: e.target.value }; setInvoiceForm((p) => ({ ...p, lines }));
                }} placeholder="Price" />
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => {
              setInvoiceForm((p) => ({ ...p, lines: [...p.lines, { description: '', quantity: '1', unitPrice: '', taxRate: '0' }] }));
            }}>+ Add Line</Button>
          </div>
          <Input label="Notes" type="text" value={invoiceForm.notes} onChange={(e) => setInvoiceForm((p) => ({ ...p, notes: e.target.value }))} />
        </div>
      </FormModal>

      {/* ── Payment Form Modal ────────────────────────────── */}
      <FormModal open={showPaymentForm} title="Record Payment" onClose={() => setShowPaymentForm(false)} onSubmit={handleSavePayment} submitLabel={saving ? 'Saving...' : 'Record'} submitDisabled={saving}>
        <div className="space-y-4">
          <Select label="Invoice (optional)" options={invoices.filter((i) => i.status !== 'paid' && i.status !== 'canceled').map((i) => ({ value: i.id, label: `${i.invoice_number} — ${formatCurrency(i.total_amount)}` }))} value={paymentForm.invoiceId} onChange={(e) => setPaymentForm((p) => ({ ...p, invoiceId: e.target.value }))} />
          <Input label="Amount *" type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))} min="0.01" step="0.01" />
          <Input label="Payment Date *" type="date" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm((p) => ({ ...p, paymentDate: e.target.value }))} />
          <Select label="Method *" options={PAYMENT_METHODS} value={paymentForm.method} onChange={(e) => setPaymentForm((p) => ({ ...p, method: e.target.value }))} />
          <Input label="Reference" type="text" value={paymentForm.reference} onChange={(e) => setPaymentForm((p) => ({ ...p, reference: e.target.value }))} />
        </div>
      </FormModal>

      {/* ── Tax Rate Form Modal ───────────────────────────── */}
      <FormModal open={showTaxRateForm} title={editingTaxRateId ? 'Edit Tax Rate' : 'New Tax Rate'} onClose={() => { setShowTaxRateForm(false); setEditingTaxRateId(null); }} onSubmit={handleSaveTaxRate} submitLabel={saving ? 'Saving...' : editingTaxRateId ? 'Update' : 'Create'} submitDisabled={saving}>
        <div className="space-y-4">
          <Input label="Name *" type="text" value={taxRateForm.name} onChange={(e) => setTaxRateForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. VAT" />
          <Input label="Rate (%) *" type="number" value={taxRateForm.rate} onChange={(e) => setTaxRateForm((p) => ({ ...p, rate: e.target.value }))} min="0" max="100" step="0.01" />
          <Input label="Jurisdiction" type="text" value={taxRateForm.jurisdiction} onChange={(e) => setTaxRateForm((p) => ({ ...p, jurisdiction: e.target.value }))} />
          <div className="flex items-center gap-2">
            <input type="checkbox" id="tax-default" checked={taxRateForm.isDefault} onChange={(e) => setTaxRateForm((p) => ({ ...p, isDefault: e.target.checked }))} className="rounded" />
            <label htmlFor="tax-default" className="text-sm text-gray-700">Set as default</label>
          </div>
        </div>
      </FormModal>
    </Card>
  );
}
