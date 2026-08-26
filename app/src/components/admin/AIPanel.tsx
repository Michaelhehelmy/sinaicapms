import React, { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { DataTable } from '@/components/ui/DataTable';
import { FormModal } from '@/components/ui/FormModal';
import { useToast } from '@/components/ui/Toast';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { queryKeys, useAIPredictionsQuery, useAIPriceRulesQuery, useAIAutomationRulesQuery, useAIAutomationLogsQuery } from '@/hooks/useQueryHooks';

type Tab = 'predictions' | 'priceRules' | 'automationRules' | 'automationLogs' | 'forecast';

interface Prediction {
  id: string;
  modelType: string;
  targetId: string | null;
  predictedValue: string | null;
  confidence: number;
  createdAt: string;
}

interface PriceRule {
  id: string;
  name: string;
  productId: string | null;
  ruleType: string;
  minPrice: number | null;
  maxPrice: number | null;
  adjustmentPercent: number;
  isActive: number;
  createdAt: string;
}

interface AutomationRule {
  id: string;
  name: string;
  triggerEvent: string;
  isActive: number;
  lastTriggeredAt: string | null;
  triggerCount: number;
  createdAt: string;
}

interface AutomationLog {
  id: string;
  ruleId: string | null;
  ruleName: string | null;
  triggerEvent: string | null;
  executedAction: string | null;
  result: string | null;
  error: string | null;
  createdAt: string;
}

// ─── Price Rule Form ──────────────────────────────────────────────
interface PriceRuleForm {
  name: string;
  productId: string;
  ruleType: string;
  minPrice: string;
  maxPrice: string;
  adjustmentPercent: string;
}

const emptyPriceRuleForm: PriceRuleForm = { name: '', productId: '', ruleType: 'dynamic', minPrice: '', maxPrice: '', adjustmentPercent: '0' };

const RULE_TYPE_OPTIONS = [
  { value: 'dynamic', label: 'Dynamic' },
  { value: 'time_based', label: 'Time Based' },
  { value: 'demand_based', label: 'Demand Based' },
  { value: 'competitor', label: 'Competitor' },
];

// ─── Automation Rule Form ─────────────────────────────────────────
interface AutomationForm {
  name: string;
  triggerEvent: string;
  conditionJson: string;
  actionJson: string;
}

const emptyAutomationForm: AutomationForm = { name: '', triggerEvent: '', conditionJson: '', actionJson: '' };

// ─── Forecast Form ────────────────────────────────────────────────
interface ForecastForm {
  productId: string;
  periodDays: string;
}

const emptyForecastForm: ForecastForm = { productId: '', periodDays: '30' };

const PERIOD_OPTIONS = [
  { value: '30', label: '30 Days' },
  { value: '60', label: '60 Days' },
  { value: '90', label: '90 Days' },
];

interface ForecastPoint {
  date: string;
  predictedDemand: number;
  confidence: number;
}

export default function AIPanel() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('predictions');

  // Data via TanStack Query
  const { data: predictions = [], isLoading: loadingPredictions } = useAIPredictionsQuery();
  const { data: priceRules = [], isLoading: loadingPriceRules } = useAIPriceRulesQuery();
  const { data: automationRules = [], isLoading: loadingAutomationRules } = useAIAutomationRulesQuery();
  const { data: automationLogs = [], isLoading: loadingAutomationLogs } = useAIAutomationLogsQuery();
  const loading = loadingPredictions || loadingPriceRules || loadingAutomationRules || loadingAutomationLogs;
  const [forecasts, setForecasts] = useState<ForecastPoint[]>([]);

  // Price Rule modal
  const [showPriceRuleForm, setShowPriceRuleForm] = useState(false);
  const [editingPriceRuleId, setEditingPriceRuleId] = useState<string | null>(null);
  const [priceRuleForm, setPriceRuleForm] = useState<PriceRuleForm>(emptyPriceRuleForm);
  const [saving, setSaving] = useState(false);

  // Automation Rule modal
  const [showAutomationForm, setShowAutomationForm] = useState(false);
  const [editingAutomationId, setEditingAutomationId] = useState<string | null>(null);
  const [automationForm, setAutomationForm] = useState<AutomationForm>(emptyAutomationForm);

  // Forecast modal
  const [showForecastForm, setShowForecastForm] = useState(false);
  const [forecastForm, setForecastForm] = useState<ForecastForm>(emptyForecastForm);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'priceRule'; item: PriceRule } | null>(null);

  const invalidateAi = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'ai'] });
  }, [queryClient]);

  // ── Price Rule handlers ────────────────────────────────────────────
  const openAddPriceRule = useCallback(() => { setEditingPriceRuleId(null); setPriceRuleForm(emptyPriceRuleForm); setShowPriceRuleForm(true); }, []);
  const openEditPriceRule = useCallback((r: PriceRule) => {
    setEditingPriceRuleId(r.id);
    setPriceRuleForm({
      name: r.name,
      productId: r.productId || '',
      ruleType: r.ruleType,
      minPrice: String(r.minPrice ?? ''),
      maxPrice: String(r.maxPrice ?? ''),
      adjustmentPercent: String(r.adjustmentPercent ?? 0),
    });
    setShowPriceRuleForm(true);
  }, []);

  const handleSavePriceRule = useCallback(async () => {
    if (!priceRuleForm.name.trim()) { showToast('Name is required.', 'warning'); return; }
    setSaving(true);
    try {
      const payload = {
        name: priceRuleForm.name.trim(),
        productId: priceRuleForm.productId || null,
        ruleType: priceRuleForm.ruleType,
        minPrice: priceRuleForm.minPrice ? parseFloat(priceRuleForm.minPrice) : null,
        maxPrice: priceRuleForm.maxPrice ? parseFloat(priceRuleForm.maxPrice) : null,
        adjustmentPercent: parseFloat(priceRuleForm.adjustmentPercent) || 0,
      };
      if (editingPriceRuleId) {
        await (api as any).updateAIPriceRule?.(editingPriceRuleId, payload);
      } else {
        await (api as any).createAIPriceRule?.(payload);
      }
      showToast(editingPriceRuleId ? 'Price rule updated.' : 'Price rule created.', 'success');
      setShowPriceRuleForm(false);
      setEditingPriceRuleId(null);
      setPriceRuleForm(emptyPriceRuleForm);
      invalidateAi();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [priceRuleForm, editingPriceRuleId, showToast, invalidateAi]);

  // ── Automation Rule handlers ────────────────────────────────────────
  const openAddAutomation = useCallback(() => { setEditingAutomationId(null); setAutomationForm(emptyAutomationForm); setShowAutomationForm(true); }, []);
  const openEditAutomation = useCallback((r: AutomationRule) => {
    setEditingAutomationId(r.id);
    setAutomationForm({ name: r.name, triggerEvent: r.triggerEvent, conditionJson: '', actionJson: '' });
    setShowAutomationForm(true);
  }, []);

  const handleSaveAutomation = useCallback(async () => {
    if (!automationForm.name.trim()) { showToast('Name is required.', 'warning'); return; }
    if (!automationForm.triggerEvent.trim()) { showToast('Trigger event is required.', 'warning'); return; }
    setSaving(true);
    try {
      const payload = {
        name: automationForm.name.trim(),
        triggerEvent: automationForm.triggerEvent.trim(),
        conditionJson: automationForm.conditionJson || undefined,
        actionJson: automationForm.actionJson || undefined,
      };
      if (editingAutomationId) {
        await (api as any).updateAIAutomationRule?.(editingAutomationId, payload);
      } else {
        await (api as any).createAIAutomationRule?.(payload);
      }
      showToast(editingAutomationId ? 'Rule updated.' : 'Rule created.', 'success');
      setShowAutomationForm(false);
      setEditingAutomationId(null);
      setAutomationForm(emptyAutomationForm);
      invalidateAi();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [automationForm, editingAutomationId, showToast, invalidateAi]);

  const handleToggleAutomation = useCallback(async (id: string) => {
    try {
      await (api as any).toggleAIAutomationRule?.(id);
      showToast('Rule toggled.', 'success');
      invalidateAi();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [showToast, invalidateAi]);

  // ── Delete price rule ──────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await (api as any).deleteAIPriceRule?.(deleteTarget.item.id);
      showToast('Deleted.', 'success');
      setDeleteTarget(null);
      invalidateAi();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [deleteTarget, showToast, invalidateAi]);

  // ── Forecast ───────────────────────────────────────────────────────
  const handleRunForecast = useCallback(async () => {
    if (!forecastForm.productId.trim()) { showToast('Product ID is required.', 'warning'); return; }
    setSaving(true);
    try {
      const result = await (api as any).runAIForecast?.({
        productId: forecastForm.productId.trim(),
        periodDays: parseInt(forecastForm.periodDays, 10),
      });
      setForecasts(result?.forecasts || []);
      showToast('Forecast generated.', 'success');
      setShowForecastForm(false);
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [forecastForm, showToast]);

  if (loading) return <LoadingSpinner text="Loading AI intelligence..." />;

  return (
    <Card padding="none" className="p-6" data-testid="ai-panel">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold text-gray-800">AI & Intelligence</h2>
        {tab === 'priceRules' && (
          <Button variant="success" size="md" onClick={openAddPriceRule} data-testid="add-price-rule-btn">
            Add Price Rule
          </Button>
        )}
        {tab === 'automationRules' && (
          <Button variant="success" size="md" onClick={openAddAutomation} data-testid="add-automation-btn">
            Add Rule
          </Button>
        )}
        {tab === 'forecast' && (
          <Button variant="primary" size="md" onClick={() => { setForecastForm(emptyForecastForm); setShowForecastForm(true); }} data-testid="run-forecast-btn">
            Run Forecast
          </Button>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Dynamic pricing, demand forecasting, anomaly detection, and automation rules.
      </p>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {([
          ['predictions', 'Predictions'],
          ['priceRules', 'Price Rules'],
          ['automationRules', 'Automation Rules'],
          ['automationLogs', 'Logs'],
          ['forecast', 'Forecast'],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            data-testid={`tab-${t}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Predictions Tab ─────────────────────────────────── */}
      {tab === 'predictions' && (
        predictions.length === 0 ? (
          <EmptyState title="No predictions yet" description="Run dynamic pricing or forecasting to generate predictions." />
        ) : (
          <DataTable<Prediction & Record<string, unknown>>
            columns={[
              { key: 'modelType', header: 'Type', sortable: true, render: (p) => <Badge variant="info" size="sm">{String(p.modelType)}</Badge> },
              { key: 'targetId', header: 'Target', render: (p) => <span className="text-sm text-gray-600">{String(p.targetId || '-')}</span> },
              { key: 'predictedValue', header: 'Value', render: (p) => <span className="font-medium text-gray-900">{String(p.predictedValue || '-')}</span> },
              { key: 'confidence', header: 'Confidence', render: (p) => {
                const conf = Number(p.confidence) || 0;
                const variant = conf > 0.7 ? 'success' : conf > 0.4 ? 'warning' : 'neutral';
                return <Badge variant={variant} size="sm">{Math.round(conf * 100)}%</Badge>;
              }},
              { key: 'createdAt', header: 'Created', render: (p) => <span className="text-xs text-gray-500">{String(p.createdAt || '').slice(0, 16)}</span> },
            ]}
            data={predictions as (Prediction & Record<string, unknown>)[]}
            emptyMessage="No predictions stored."
          />
        )
      )}

      {/* ── Price Rules Tab ─────────────────────────────────── */}
      {tab === 'priceRules' && (
        priceRules.length === 0 ? (
          <EmptyState title="No price rules" description="Create pricing rules to enable dynamic pricing." action={{ label: 'Add Price Rule', onClick: openAddPriceRule }} />
        ) : (
          <DataTable<PriceRule & Record<string, unknown>>
            columns={[
              { key: 'name', header: 'Name', sortable: true, render: (r) => <strong className="text-gray-900">{String(r.name)}</strong> },
              { key: 'productId', header: 'Product', render: (r) => <span className="text-sm text-gray-600">{String(r.productId || 'All')}</span> },
              { key: 'ruleType', header: 'Type', render: (r) => <Badge variant="info" size="sm">{String(r.ruleType)}</Badge> },
              { key: 'minPrice', header: 'Min', render: (r) => <span className="text-sm">{r.minPrice != null ? `$${Number(r.minPrice).toFixed(2)}` : '-'}</span> },
              { key: 'maxPrice', header: 'Max', render: (r) => <span className="text-sm">{r.maxPrice != null ? `$${Number(r.maxPrice).toFixed(2)}` : '-'}</span> },
              { key: 'adjustmentPercent', header: 'Adj %', render: (r) => <span className="text-sm">{Number(r.adjustmentPercent)}%</span> },
              { key: 'isActive', header: 'Active', render: (r) => <Badge variant={Number(r.isActive) === 1 ? 'success' : 'neutral'} dot size="sm">{Number(r.isActive) === 1 ? 'Yes' : 'No'}</Badge> },
            ]}
            data={priceRules as (PriceRule & Record<string, unknown>)[]}
            emptyMessage="No price rules."
            actions={(r) => (
              <div className="flex gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => openEditPriceRule(r as unknown as PriceRule)}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => setDeleteTarget({ type: 'priceRule', item: r as unknown as PriceRule })}>Delete</Button>
              </div>
            )}
          />
        )
      )}

      {/* ── Automation Rules Tab ────────────────────────────── */}
      {tab === 'automationRules' && (
        automationRules.length === 0 ? (
          <EmptyState title="No automation rules" description="Create rules to automate actions based on events." action={{ label: 'Add Rule', onClick: openAddAutomation }} />
        ) : (
          <DataTable<AutomationRule & Record<string, unknown>>
            columns={[
              { key: 'name', header: 'Name', sortable: true, render: (r) => <strong className="text-gray-900">{String(r.name)}</strong> },
              { key: 'triggerEvent', header: 'Trigger', render: (r) => <Badge variant="warning" size="sm">{String(r.triggerEvent)}</Badge> },
              { key: 'isActive', header: 'Active', render: (r) => <Badge variant={Number(r.isActive) === 1 ? 'success' : 'neutral'} dot size="sm">{Number(r.isActive) === 1 ? 'Yes' : 'No'}</Badge> },
              { key: 'lastTriggeredAt', header: 'Last Triggered', render: (r) => <span className="text-xs text-gray-500">{r.lastTriggeredAt ? String(r.lastTriggeredAt).slice(0, 16) : 'Never'}</span> },
              { key: 'triggerCount', header: 'Count', render: (r) => <span className="text-sm font-medium">{Number(r.triggerCount)}</span> },
            ]}
            data={automationRules as (AutomationRule & Record<string, unknown>)[]}
            emptyMessage="No automation rules."
            actions={(r) => (
              <div className="flex gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => handleToggleAutomation(String(r.id))}>
                  {Number(r.isActive) === 1 ? 'Deactivate' : 'Activate'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openEditAutomation(r as unknown as AutomationRule)}>Edit</Button>
              </div>
            )}
          />
        )
      )}

      {/* ── Automation Logs Tab ─────────────────────────────── */}
      {tab === 'automationLogs' && (
        automationLogs.length === 0 ? (
          <EmptyState title="No automation logs" description="Logs will appear here when rules are triggered." />
        ) : (
          <DataTable<AutomationLog & Record<string, unknown>>
            columns={[
              { key: 'ruleName', header: 'Rule', render: (l) => <strong className="text-gray-900">{String(l.ruleName || 'Unknown')}</strong> },
              { key: 'triggerEvent', header: 'Event', render: (l) => <span className="text-sm text-gray-600">{String(l.triggerEvent || '-')}</span> },
              { key: 'result', header: 'Result', render: (l) => {
                const variant = l.result === 'success' ? 'success' : 'danger';
                return <Badge variant={variant} dot size="sm">{String(l.result)}</Badge>;
              }},
              { key: 'error', header: 'Error', render: (l) => <span className="text-xs text-red-500 truncate max-w-[200px] block">{String(l.error || '-')}</span> },
              { key: 'createdAt', header: 'Date', render: (l) => <span className="text-xs text-gray-500">{String(l.createdAt || '').slice(0, 16)}</span> },
            ]}
            data={automationLogs as (AutomationLog & Record<string, unknown>)[]}
            emptyMessage="No logs."
          />
        )
      )}

      {/* ── Forecast Dashboard Tab ──────────────────────────── */}
      {tab === 'forecast' && (
        forecasts.length === 0 ? (
          <EmptyState title="No forecast data" description="Run a forecast to see demand predictions over time." action={{ label: 'Run Forecast', onClick: () => { setForecastForm(emptyForecastForm); setShowForecastForm(true); } }} />
        ) : (
          <div>
            <div className="mb-4 flex items-center gap-4">
              <h3 className="text-sm font-semibold text-gray-700">Demand Forecast ({forecasts.length} days)</h3>
              <Button variant="ghost" size="sm" onClick={() => { setForecastForm(emptyForecastForm); setShowForecastForm(true); }}>New Forecast</Button>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="max-h-96 overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Predicted Demand</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Confidence</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Bar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {forecasts.map((f, i) => {
                      const maxDemand = Math.max(...forecasts.map((x) => x.predictedDemand), 1);
                      const barWidth = Math.round((f.predictedDemand / maxDemand) * 100);
                      return (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-700">{f.date}</td>
                          <td className="px-4 py-2 text-right font-medium text-gray-900">{f.predictedDemand}</td>
                          <td className="px-4 py-2 text-right">
                            <Badge variant={f.confidence > 0.7 ? 'success' : f.confidence > 0.4 ? 'warning' : 'neutral'} size="sm">
                              {Math.round(f.confidence * 100)}%
                            </Badge>
                          </td>
                          <td className="px-4 py-2">
                            <div className="w-full bg-gray-100 rounded-full h-2">
                              <div className="bg-violet-500 h-2 rounded-full" style={{ width: `${barWidth}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}

      {/* ── Price Rule Form Modal ───────────────────────────── */}
      <FormModal open={showPriceRuleForm} title={editingPriceRuleId ? 'Edit Price Rule' : 'Add Price Rule'} onClose={() => { setShowPriceRuleForm(false); setEditingPriceRuleId(null); }} onSubmit={handleSavePriceRule} submitLabel={saving ? 'Saving...' : editingPriceRuleId ? 'Update' : 'Save'} submitDisabled={saving}>
        <div className="space-y-4">
          <Input label="Name *" type="text" value={priceRuleForm.name} onChange={(e) => setPriceRuleForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Summer Pricing" />
          <Input label="Product ID" type="text" value={priceRuleForm.productId} onChange={(e) => setPriceRuleForm((p) => ({ ...p, productId: e.target.value }))} placeholder="Leave empty for all products" />
          <Select label="Rule Type *" options={RULE_TYPE_OPTIONS} value={priceRuleForm.ruleType} onChange={(e) => setPriceRuleForm((p) => ({ ...p, ruleType: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Min Price" type="number" value={priceRuleForm.minPrice} onChange={(e) => setPriceRuleForm((p) => ({ ...p, minPrice: e.target.value }))} min="0" step="0.01" />
            <Input label="Max Price" type="number" value={priceRuleForm.maxPrice} onChange={(e) => setPriceRuleForm((p) => ({ ...p, maxPrice: e.target.value }))} min="0" step="0.01" />
          </div>
          <Input label="Adjustment %" type="number" value={priceRuleForm.adjustmentPercent} onChange={(e) => setPriceRuleForm((p) => ({ ...p, adjustmentPercent: e.target.value }))} step="0.1" />
        </div>
      </FormModal>

      {/* ── Automation Rule Form Modal ──────────────────────── */}
      <FormModal open={showAutomationForm} title={editingAutomationId ? 'Edit Automation Rule' : 'Add Automation Rule'} onClose={() => { setShowAutomationForm(false); setEditingAutomationId(null); }} onSubmit={handleSaveAutomation} submitLabel={saving ? 'Saving...' : editingAutomationId ? 'Update' : 'Save'} submitDisabled={saving}>
        <div className="space-y-4">
          <Input label="Name *" type="text" value={automationForm.name} onChange={(e) => setAutomationForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Low Stock Alert" />
          <Input label="Trigger Event *" type="text" value={automationForm.triggerEvent} onChange={(e) => setAutomationForm((p) => ({ ...p, triggerEvent: e.target.value }))} placeholder="e.g. stock.low, order.completed" />
          <Input label="Condition (JSON)" type="text" value={automationForm.conditionJson} onChange={(e) => setAutomationForm((p) => ({ ...p, conditionJson: e.target.value }))} placeholder='e.g. {"threshold": 10}' />
          <Input label="Action (JSON)" type="text" value={automationForm.actionJson} onChange={(e) => setAutomationForm((p) => ({ ...p, actionJson: e.target.value }))} placeholder='e.g. {"type": "email", "to": "admin@example.com"}' />
        </div>
      </FormModal>

      {/* ── Forecast Form Modal ─────────────────────────────── */}
      <FormModal open={showForecastForm} title="Run Demand Forecast" onClose={() => setShowForecastForm(false)} onSubmit={handleRunForecast} submitLabel={saving ? 'Generating...' : 'Generate Forecast'} submitDisabled={saving}>
        <div className="space-y-4">
          <Input label="Product ID *" type="text" value={forecastForm.productId} onChange={(e) => setForecastForm((p) => ({ ...p, productId: e.target.value }))} placeholder="Product to forecast" />
          <Select label="Period *" options={PERIOD_OPTIONS} value={forecastForm.periodDays} onChange={(e) => setForecastForm((p) => ({ ...p, periodDays: e.target.value }))} />
        </div>
      </FormModal>

      {/* ── Delete Confirmation ─────────────────────────────── */}
      {deleteTarget && (
        <FormModal open title="Delete Price Rule" onClose={() => setDeleteTarget(null)} onSubmit={handleDelete} submitLabel="Delete" submitDisabled={false}>
          <p className="text-sm text-gray-600">Are you sure you want to delete &quot;{deleteTarget.item.name}&quot;? This cannot be undone.</p>
        </FormModal>
      )}
    </Card>
  );
}
