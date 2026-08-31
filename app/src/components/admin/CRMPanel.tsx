import React, { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
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
import { queryKeys, useCrmContactsQuery, useCrmLeadsQuery, useCrmOpportunitiesQuery, useCrmTasksQuery, useCrmTicketsQuery, useCrmKnowledgeArticlesQuery } from '@/hooks/useQueryHooks';

type Tab = 'contacts' | 'leads' | 'opportunities' | 'tasks' | 'tickets' | 'knowledge';

// ─── Contact Form ──────────────────────────────────────────────
interface ContactForm {
  type: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  industry: string;
  isCustomer: boolean;
  isVendor: boolean;
  isLead: boolean;
  notes: string;
}
const emptyContactForm: ContactForm = { type: 'individual', name: '', email: '', phone: '', address: '', industry: '', isCustomer: false, isVendor: false, isLead: false, notes: '' };

// ─── Lead Form ─────────────────────────────────────────────────
interface LeadForm {
  contactId: string;
  source: string;
  assignedTo: string;
  value: string;
  notes: string;
}
const emptyLeadForm: LeadForm = { contactId: '', source: '', assignedTo: '', value: '', notes: '' };

// ─── Opportunity Form ──────────────────────────────────────────
interface OppForm {
  name: string;
  leadId: string;
  amount: string;
  probability: string;
  expectedCloseDate: string;
  assignedTo: string;
}
const emptyOppForm: OppForm = { name: '', leadId: '', amount: '', probability: '', expectedCloseDate: '', assignedTo: '' };

// ─── Task Form ─────────────────────────────────────────────────
interface TaskForm {
  title: string;
  description: string;
  projectId: string;
  assigneeId: string;
  priority: string;
  dueDate: string;
}
const emptyTaskForm: TaskForm = { title: '', description: '', projectId: '', assigneeId: '', priority: 'medium', dueDate: '' };

// ─── Ticket Form ───────────────────────────────────────────────
interface TicketForm {
  contactId: string;
  subject: string;
  description: string;
  priority: string;
  assignedTo: string;
}
const emptyTicketForm: TicketForm = { contactId: '', subject: '', description: '', priority: 'medium', assignedTo: '' };

// ─── Knowledge Form ────────────────────────────────────────────
interface KBArticleForm {
  title: string;
  content: string;
  category: string;
  tags: string;
  isPublished: boolean;
}
const emptyKBForm: KBArticleForm = { title: '', content: '', category: '', tags: '', isPublished: false };

// ─── Status / Stage Options ────────────────────────────────────
const LEAD_STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

const OPP_STAGE_OPTIONS = [
  { value: 'qualification', label: 'Qualification' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'closed_won', label: 'Closed Won' },
  { value: 'closed_lost', label: 'Closed Lost' },
];

const TASK_STATUS_OPTIONS = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'blocked', label: 'Blocked' },
];

const TASK_PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const TICKET_STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const CONTACT_TYPE_OPTIONS = [
  { value: 'individual', label: 'Individual' },
  { value: 'company', label: 'Company' },
];

const PRIORITY_BADGE: Record<string, { variant: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  low: { variant: 'neutral' },
  medium: { variant: 'info' },
  high: { variant: 'warning' },
  urgent: { variant: 'danger' },
  critical: { variant: 'danger' },
};

const STATUS_BADGE: Record<string, { variant: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  new: { variant: 'info' },
  contacted: { variant: 'info' },
  qualified: { variant: 'success' },
  proposal: { variant: 'warning' },
  negotiation: { variant: 'warning' },
  won: { variant: 'success' },
  lost: { variant: 'danger' },
  open: { variant: 'info' },
  pending: { variant: 'warning' },
  resolved: { variant: 'success' },
  closed: { variant: 'neutral' },
  todo: { variant: 'neutral' },
  in_progress: { variant: 'info' },
  done: { variant: 'success' },
  blocked: { variant: 'danger' },
  qualification: { variant: 'info' },
  closed_won: { variant: 'success' },
  closed_lost: { variant: 'danger' },
};

// ─── Kanban Board Component ─────────────────────────────────────────────────
interface KanbanBoardProps {
  opportunities: Record<string, unknown>[];
  onStageChange: (opp: Record<string, unknown>, newStage: string) => void;
}

// Shared humanizer used by KanbanBoard/GanttChart (module scope) AND inside
// CRMPanel. Must live at module scope — it is referenced by the two module-level
// sub-components above, so declaring it inside CRMPanel caused a ReferenceError.
const formatLabel = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const KANBAN_STAGES = ['qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];

const STAGE_COLORS: Record<string, string> = {
  qualification: 'bg-blue-50 border-blue-200',
  proposal: 'bg-yellow-50 border-yellow-200',
  negotiation: 'bg-orange-50 border-orange-200',
  closed_won: 'bg-green-50 border-green-200',
  closed_lost: 'bg-red-50 border-red-200',
};

function KanbanBoard({ opportunities, onStageChange }: KanbanBoardProps) {
  const grouped = KANBAN_STAGES.reduce((acc, stage) => {
    acc[stage] = opportunities.filter(o => o.stage === stage);
    return acc;
  }, {} as Record<string, Record<string, unknown>[]>);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4" data-testid="kanban-board">
      {KANBAN_STAGES.map(stage => (
        <div key={stage} className={`min-w-[280px] flex-1 border rounded-lg ${STAGE_COLORS[stage] || 'bg-gray-50 border-gray-200'}`}>
          <div className="px-3 py-2 border-b border-inherit">
            <h3 className="text-sm font-semibold text-gray-700">{formatLabel(stage)}</h3>
            <p className="text-xs text-gray-500">{grouped[stage]?.length || 0} opportunities</p>
          </div>
          <div className="p-2 space-y-2 min-h-[100px]">
            {(grouped[stage] || []).map(opp => (
              <div key={String(opp.id)} className="bg-white rounded-md shadow-sm border border-gray-200 p-3 cursor-default hover:shadow-md transition-shadow">
                <p className="text-sm font-medium text-gray-900 truncate">{String(opp.name)}</p>
                <p className="text-xs text-gray-500 mt-1">{formatCurrency(Number(opp.amount || 0))}</p>
                {String(opp.probability || 0) !== '0' && (
                  <p className="text-xs text-gray-400 mt-0.5">{String(opp.probability)}% probability</p>
                )}
                <div className="flex gap-1 mt-2 flex-wrap">
                  {stage !== 'closed_won' && stage !== 'closed_lost' && (
                    <>
                      {stage === 'qualification' && (
                        <button onClick={() => onStageChange(opp, 'proposal')} className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">→ Proposal</button>
                      )}
                      {stage === 'proposal' && (
                        <button onClick={() => onStageChange(opp, 'negotiation')} className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200">→ Negotiation</button>
                      )}
                      {stage === 'negotiation' && (
                        <>
                          <button onClick={() => onStageChange(opp, 'closed_won')} className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded hover:bg-green-200">→ Won</button>
                          <button onClick={() => onStageChange(opp, 'closed_lost')} className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded hover:bg-red-200">→ Lost</button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Gantt Chart Component ──────────────────────────────────────────────────
interface GanttChartProps {
  tasks: Record<string, unknown>[];
}

const TASK_STATUS_COLORS: Record<string, string> = {
  todo: 'bg-gray-400',
  in_progress: 'bg-blue-500',
  done: 'bg-green-500',
  blocked: 'bg-red-500',
};

function GanttChart({ tasks }: GanttChartProps) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Find tasks with due dates
  const tasksWithDates = tasks
    .filter(t => t.dueDate)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));

  if (tasksWithDates.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center" data-testid="gantt-chart">
        <p className="text-sm text-gray-500">No tasks with due dates to display in Gantt view.</p>
        <p className="text-xs text-gray-400 mt-1">Add due dates to tasks to see them on the timeline.</p>
      </div>
    );
  }

  // Calculate date range
  const dates = tasksWithDates.map(t => String(t.dueDate));
  const minDate = new Date(Math.min(...dates.map(d => new Date(d).getTime())));
  const maxDate = new Date(Math.max(...dates.map(d => new Date(d).getTime())));
  const totalDays = Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  // Generate day headers (show max 30 days)
  const displayDays = Math.min(totalDays, 30);
  const dayHeaders: string[] = [];
  for (let i = 0; i < displayDays; i++) {
    const d = new Date(minDate);
    d.setDate(d.getDate() + i);
    dayHeaders.push(d.toISOString().split('T')[0]);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden" data-testid="gantt-chart">
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">Task Timeline</h3>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Day headers */}
          <div className="flex border-b border-gray-200">
            <div className="w-48 min-w-[192px] px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50 border-r border-gray-200">Task</div>
            <div className="flex-1 flex">
              {dayHeaders.map(day => {
                const isToday = day === todayStr;
                return (
                  <div key={day} className={`flex-1 px-1 py-2 text-center text-[10px] border-r border-gray-100 ${isToday ? 'bg-blue-50 font-bold text-blue-700' : 'text-gray-400'}`}>
                    {new Date(day + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                );
              })}
            </div>
          </div>
          {/* Task rows */}
          {tasksWithDates.map(task => {
            const dueDate = new Date(String(task.dueDate));
            const dayIndex = Math.floor((dueDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
            const isOverdue = dueDate < today && task.status !== 'done';
            const color = TASK_STATUS_COLORS[String(task.status)] || 'bg-gray-400';
            return (
              <div key={String(task.id)} className="flex border-b border-gray-100 hover:bg-gray-50">
                <div className="w-48 min-w-[192px] px-3 py-2 border-r border-gray-200">
                  <p className="text-sm font-medium text-gray-900 truncate">{String(task.title)}</p>
                  <p className="text-[10px] text-gray-400">{formatLabel(String(task.status))}</p>
                </div>
                <div className="flex-1 flex relative">
                  {dayHeaders.map((day, i) => {
                    const isTaskDay = i === dayIndex;
                    const isOverdueDay = isTaskDay && isOverdue;
                    return (
                      <div key={day} className={`flex-1 px-1 py-2 border-r border-gray-50 ${day === todayStr ? 'bg-blue-50/50' : ''}`}>
                        {isTaskDay && (
                          <div className={`h-5 rounded ${isOverdueDay ? 'bg-red-400 animate-pulse' : color} flex items-center justify-center`}>
                            <span className="text-[8px] text-white font-medium truncate px-1">{formatLabel(String(task.status))}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex gap-4 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-gray-400 inline-block" /> To Do</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-500 inline-block" /> In Progress</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-500 inline-block" /> Done</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500 inline-block" /> Blocked</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-400 animate-pulse inline-block" /> Overdue</span>
      </div>
    </div>
  );
}

export default function CRMPanel() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('contacts');

  // Data via TanStack Query
  const { data: contacts = [], isLoading: loadingContacts } = useCrmContactsQuery();
  const { data: leads = [], isLoading: loadingLeads } = useCrmLeadsQuery();
  const { data: opportunities = [], isLoading: loadingOpps } = useCrmOpportunitiesQuery();
  const { data: tasks = [], isLoading: loadingTasks } = useCrmTasksQuery();
  const { data: tickets = [], isLoading: loadingTickets } = useCrmTicketsQuery();
  const { data: articles = [], isLoading: loadingArticles } = useCrmKnowledgeArticlesQuery();
  const loading = loadingContacts || loadingLeads || loadingOpps || loadingTasks || loadingTickets || loadingArticles;

  // Contact modal
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState<ContactForm>(emptyContactForm);

  // Lead modal
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadForm, setLeadForm] = useState<LeadForm>(emptyLeadForm);
  const [leadStatusTarget, setLeadStatusTarget] = useState<Record<string, unknown> | null>(null);

  // Opportunity modal
  const [showOppForm, setShowOppForm] = useState(false);
  const [oppForm, setOppForm] = useState<OppForm>(emptyOppForm);
  const [oppStageTarget, setOppStageTarget] = useState<Record<string, unknown> | null>(null);
  const [oppViewMode, setOppViewMode] = useState<'table' | 'kanban'>('table');
  const [taskViewMode, setTaskViewMode] = useState<'table' | 'gantt'>('table');

  // Task modal
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState<TaskForm>(emptyTaskForm);
  const [taskStatusTarget, setTaskStatusTarget] = useState<Record<string, unknown> | null>(null);

  // Ticket modal
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketForm, setTicketForm] = useState<TicketForm>(emptyTicketForm);
  const [ticketCommentTarget, setTicketCommentTarget] = useState<Record<string, unknown> | null>(null);
  const [commentText, setCommentText] = useState('');

  // Knowledge modal
  const [showKBForm, setShowKBForm] = useState(false);
  const [editingKBId, setEditingKBId] = useState<string | null>(null);
  const [kbForm, setKbForm] = useState<KBArticleForm>(emptyKBForm);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string; name: string } | null>(null);

  const [saving, setSaving] = useState(false);

  const invalidateCrm = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'crm'] });
  }, [queryClient]);

  // ── Contact handlers ──────────────────────────────────────────
  const openAddContact = useCallback(() => { setEditingContactId(null); setContactForm(emptyContactForm); setShowContactForm(true); }, []);
  const openEditContact = useCallback((r: Record<string, unknown>) => {
    setEditingContactId(String(r.id));
    setContactForm({
      type: String(r.type || 'individual'),
      name: String(r.name || ''),
      email: String(r.email || ''),
      phone: String(r.phone || ''),
      address: String(r.address || ''),
      industry: String(r.industry || ''),
      isCustomer: Boolean(r.isCustomer),
      isVendor: Boolean(r.isVendor),
      isLead: Boolean(r.isLead),
      notes: String(r.notes || ''),
    });
    setShowContactForm(true);
  }, []);

  const handleSaveContact = useCallback(async () => {
    if (!contactForm.name.trim()) { showToast('Name is required.', 'warning'); return; }
    setSaving(true);
    try {
      const body = { ...contactForm, name: contactForm.name.trim() };
      if (editingContactId) {
        await apiFetch(`/crm/contacts/${editingContactId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/crm/contacts', { method: 'POST', body: JSON.stringify(body) });
      }
      showToast(editingContactId ? 'Contact updated.' : 'Contact created.', 'success');
      setShowContactForm(false);
      setEditingContactId(null);
      invalidateCrm();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [contactForm, editingContactId, showToast, invalidateCrm]);

  // ── Lead handlers ─────────────────────────────────────────────
  const openAddLead = useCallback(() => { setLeadForm(emptyLeadForm); setShowLeadForm(true); }, []);
  const handleSaveLead = useCallback(async () => {
    if (!leadForm.contactId) { showToast('Contact is required.', 'warning'); return; }
    setSaving(true);
    try {
      await apiFetch('/crm/leads', { method: 'POST', body: JSON.stringify({ ...leadForm, value: leadForm.value ? parseFloat(leadForm.value) : undefined }) });
      showToast('Lead created.', 'success');
      setShowLeadForm(false);
      invalidateCrm();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [leadForm, showToast, invalidateCrm]);

  const handleLeadStatus = useCallback(async (newStatus: string) => {
    if (!leadStatusTarget) return;
    try {
      await apiFetch(`/crm/leads/${leadStatusTarget.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      showToast(`Lead marked as ${newStatus}.`, 'success');
      setLeadStatusTarget(null);
      invalidateCrm();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [leadStatusTarget, showToast, invalidateCrm]);

  // ── Opportunity handlers ──────────────────────────────────────
  const openAddOpp = useCallback(() => { setOppForm(emptyOppForm); setShowOppForm(true); }, []);
  const handleSaveOpp = useCallback(async () => {
    if (!oppForm.name.trim()) { showToast('Name is required.', 'warning'); return; }
    setSaving(true);
    try {
      await apiFetch('/crm/opportunities', {
        method: 'POST',
        body: JSON.stringify({
          name: oppForm.name.trim(),
          leadId: oppForm.leadId || null,
          amount: oppForm.amount ? parseFloat(oppForm.amount) : undefined,
          probability: oppForm.probability ? parseInt(oppForm.probability) : undefined,
          expectedCloseDate: oppForm.expectedCloseDate || null,
          assignedTo: oppForm.assignedTo || null,
        }),
      });
      showToast('Opportunity created.', 'success');
      setShowOppForm(false);
      invalidateCrm();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [oppForm, showToast, invalidateCrm]);

  const handleOppStage = useCallback(async (newStage: string) => {
    if (!oppStageTarget) return;
    try {
      await apiFetch(`/crm/opportunities/${oppStageTarget.id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage: newStage }) });
      showToast(`Opportunity moved to ${newStage}.`, 'success');
      setOppStageTarget(null);
      invalidateCrm();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [oppStageTarget, showToast, invalidateCrm]);

  const handleMoveOppStage = useCallback(async (opp: Record<string, unknown>, newStage: string) => {
    try {
      await apiFetch(`/crm/opportunities/${opp.id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage: newStage }) });
      showToast(`Opportunity moved to ${formatLabel(newStage)}.`, 'success');
      invalidateCrm();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [showToast, invalidateCrm]);

  // ── Task handlers ─────────────────────────────────────────────
  const openAddTask = useCallback(() => { setTaskForm(emptyTaskForm); setShowTaskForm(true); }, []);
  const handleSaveTask = useCallback(async () => {
    if (!taskForm.title.trim()) { showToast('Title is required.', 'warning'); return; }
    setSaving(true);
    try {
      await apiFetch('/crm/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: taskForm.title.trim(),
          description: taskForm.description || null,
          projectId: taskForm.projectId || null,
          assigneeId: taskForm.assigneeId || null,
          priority: taskForm.priority,
          dueDate: taskForm.dueDate || null,
        }),
      });
      showToast('Task created.', 'success');
      setShowTaskForm(false);
      invalidateCrm();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [taskForm, showToast, invalidateCrm]);

  const handleTaskStatus = useCallback(async (newStatus: string) => {
    if (!taskStatusTarget) return;
    try {
      await apiFetch(`/crm/tasks/${taskStatusTarget.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      showToast(`Task status updated.`, 'success');
      setTaskStatusTarget(null);
      invalidateCrm();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [taskStatusTarget, showToast, invalidateCrm]);

  // ── Ticket handlers ───────────────────────────────────────────
  const openAddTicket = useCallback(() => { setTicketForm(emptyTicketForm); setShowTicketForm(true); }, []);
  const handleSaveTicket = useCallback(async () => {
    if (!ticketForm.subject.trim()) { showToast('Subject is required.', 'warning'); return; }
    setSaving(true);
    try {
      await apiFetch('/crm/tickets', {
        method: 'POST',
        body: JSON.stringify({
          contactId: ticketForm.contactId || null,
          subject: ticketForm.subject.trim(),
          description: ticketForm.description || null,
          priority: ticketForm.priority,
          assignedTo: ticketForm.assignedTo || null,
        }),
      });
      showToast('Ticket created.', 'success');
      setShowTicketForm(false);
      invalidateCrm();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [ticketForm, showToast, invalidateCrm]);

  const handleAddComment = useCallback(async () => {
    if (!ticketCommentTarget || !commentText.trim()) return;
    try {
      await apiFetch(`/crm/tickets/${ticketCommentTarget.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ userId: 'current-user', content: commentText.trim() }),
      });
      showToast('Comment added.', 'success');
      setTicketCommentTarget(null);
      setCommentText('');
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [ticketCommentTarget, commentText, showToast]);

  // ── Knowledge handlers ────────────────────────────────────────
  const openAddKB = useCallback(() => { setEditingKBId(null); setKbForm(emptyKBForm); setShowKBForm(true); }, []);
  const openEditKB = useCallback((r: Record<string, unknown>) => {
    setEditingKBId(String(r.id));
    setKbForm({
      title: String(r.title || ''),
      content: String(r.content || ''),
      category: String(r.category || ''),
      tags: String(r.tags || ''),
      isPublished: Boolean(r.isPublished),
    });
    setShowKBForm(true);
  }, []);

  const handleSaveKB = useCallback(async () => {
    if (!kbForm.title.trim() || !kbForm.content.trim()) { showToast('Title and content are required.', 'warning'); return; }
    setSaving(true);
    try {
      await apiFetch('/crm/knowledge-articles', {
        method: 'POST',
        body: JSON.stringify({ ...kbForm, title: kbForm.title.trim(), content: kbForm.content.trim() }),
      });
      showToast(editingKBId ? 'Article updated.' : 'Article created.', 'success');
      setShowKBForm(false);
      setEditingKBId(null);
      invalidateCrm();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [kbForm, editingKBId, showToast, invalidateCrm]);

  // ── Delete handler ────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'contact') {
        await apiFetch(`/crm/contacts/${deleteTarget.id}`, { method: 'DELETE' });
      }
      showToast('Deleted.', 'success');
      setDeleteTarget(null);
      invalidateCrm();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [deleteTarget, showToast, invalidateCrm]);

  const badgeVariant = (status: string) => STATUS_BADGE[status]?.variant || 'neutral' as const;

  if (loading) return <LoadingSpinner text="Loading CRM..." />;

  return (
    <Card padding="none" className="p-6" data-testid="crm-panel">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold text-gray-800">CRM & Projects</h2>
        {(tab === 'contacts' || tab === 'knowledge') && (
          <Button variant="success" size="md" onClick={tab === 'contacts' ? openAddContact : openAddKB} data-testid="add-btn">
            {tab === 'contacts' ? 'Add Contact' : 'Add Article'}
          </Button>
        )}
        {tab === 'leads' && <Button variant="success" size="md" onClick={openAddLead}>Add Lead</Button>}
        {tab === 'opportunities' && <Button variant="success" size="md" onClick={openAddOpp}>Add Opportunity</Button>}
        {tab === 'opportunities' && (
          <div className="flex gap-1 ml-auto">
            <Button variant={oppViewMode === 'table' ? 'primary' : 'ghost'} size="sm" onClick={() => setOppViewMode('table')}>Table</Button>
            <Button variant={oppViewMode === 'kanban' ? 'primary' : 'ghost'} size="sm" onClick={() => setOppViewMode('kanban')}>Kanban</Button>
          </div>
        )}
        {tab === 'tasks' && <Button variant="success" size="md" onClick={openAddTask}>Add Task</Button>}
        {tab === 'tasks' && (
          <div className="flex gap-1 ml-auto">
            <Button variant={taskViewMode === 'table' ? 'primary' : 'ghost'} size="sm" onClick={() => setTaskViewMode('table')}>Table</Button>
            <Button variant={taskViewMode === 'gantt' ? 'primary' : 'ghost'} size="sm" onClick={() => setTaskViewMode('gantt')}>Gantt</Button>
          </div>
        )}
        {tab === 'tickets' && <Button variant="success" size="md" onClick={openAddTicket}>Add Ticket</Button>}
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Manage contacts, sales pipeline, tasks, and helpdesk tickets.
      </p>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {(['contacts', 'leads', 'opportunities', 'tasks', 'tickets', 'knowledge'] as Tab[]).map((t) => {
          const counts: Record<Tab, number> = {
            contacts: contacts.length,
            leads: leads.length,
            opportunities: opportunities.length,
            tasks: tasks.length,
            tickets: tickets.length,
            knowledge: articles.length,
          };
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              data-testid={`tab-${t}`}
            >
              {t === 'knowledge' ? 'Knowledge' : t.charAt(0).toUpperCase() + t.slice(1)} ({counts[t]})
            </button>
          );
        })}
      </div>

      {/* ── Contacts Tab ────────────────────────────────────── */}
      {tab === 'contacts' && (
        contacts.length === 0 ? (
          <EmptyState title="No contacts" description="Add your first contact to get started." action={{ label: 'Add Contact', onClick: openAddContact }} />
        ) : (
          <DataTable
            columns={[
              { key: 'name', header: 'Name', sortable: true, render: (r) => <strong className="text-gray-900">{String(r.name)}</strong> },
              { key: 'email', header: 'Email', render: (r) => <span className="text-sm text-gray-600">{String(r.email || '-')}</span> },
              { key: 'phone', header: 'Phone', render: (r) => <span className="text-sm text-gray-600">{String(r.phone || '-')}</span> },
              { key: 'type', header: 'Type', render: (r) => <Badge variant="neutral" size="sm">{String(r.type)}</Badge> },
              { key: 'flags', header: 'Flags', render: (r) => (
                <div className="flex gap-1">
                  {r.isCustomer ? <Badge variant="success" size="sm">Customer</Badge> : null}
                  {r.isVendor ? <Badge variant="info" size="sm">Vendor</Badge> : null}
                  {r.isLead ? <Badge variant="warning" size="sm">Lead</Badge> : null}
                </div>
              )},
            ]}
            data={contacts}
            emptyMessage="No contacts."
            actions={(r) => (
              <div className="flex gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => openEditContact(r)}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => setDeleteTarget({ type: 'contact', id: String(r.id), name: String(r.name) })}>Delete</Button>
              </div>
            )}
          />
        )
      )}

      {/* ── Leads Tab ───────────────────────────────────────── */}
      {tab === 'leads' && (
        leads.length === 0 ? (
          <EmptyState title="No leads" description="Create a lead from an existing contact." action={{ label: 'Add Lead', onClick: openAddLead }} />
        ) : (
          <DataTable
            columns={[
              { key: 'contactName', header: 'Contact', sortable: true, render: (r) => <strong className="text-gray-900">{String(r.contactName || '-')}</strong> },
              { key: 'status', header: 'Status', render: (r) => <Badge variant={badgeVariant(String(r.status))} dot size="sm">{formatLabel(String(r.status))}</Badge> },
              { key: 'source', header: 'Source', render: (r) => <span className="text-sm text-gray-600">{String(r.source || '-')}</span> },
              { key: 'value', header: 'Value', render: (r) => <span className="font-medium">{formatCurrency(Number(r.value || 0))}</span> },
              { key: 'assignedTo', header: 'Assigned', render: (r) => <span className="text-sm text-gray-600">{String(r.assignedTo || '-')}</span> },
            ]}
            data={leads}
            emptyMessage="No leads."
            actions={(r) => (
              <Button variant="ghost" size="sm" onClick={() => setLeadStatusTarget(r)}>Update Status</Button>
            )}
          />
        )
      )}

      {/* ── Opportunities Tab ────────────────────────────────── */}
      {tab === 'opportunities' && (
        opportunities.length === 0 ? (
          <EmptyState title="No opportunities" description="Track your sales pipeline opportunities." action={{ label: 'Add Opportunity', onClick: openAddOpp }} />
        ) : oppViewMode === 'kanban' ? (
          <KanbanBoard opportunities={opportunities} onStageChange={handleMoveOppStage} />
        ) : (
          <DataTable
            columns={[
              { key: 'name', header: 'Name', sortable: true, render: (r) => <strong className="text-gray-900">{String(r.name)}</strong> },
              { key: 'stage', header: 'Stage', render: (r) => <Badge variant={badgeVariant(String(r.stage))} dot size="sm">{formatLabel(String(r.stage))}</Badge> },
              { key: 'amount', header: 'Amount', render: (r) => <span className="font-medium">{formatCurrency(Number(r.amount || 0))}</span> },
              { key: 'probability', header: 'Probability', render: (r) => <span className="text-sm text-gray-600">{String(r.probability || 0)}%</span> },
              { key: 'expectedCloseDate', header: 'Expected Close', render: (r) => <span className="text-sm text-gray-600">{String(r.expectedCloseDate || '-')}</span> },
            ]}
            data={opportunities}
            emptyMessage="No opportunities."
            actions={(r) => (
              <Button variant="ghost" size="sm" onClick={() => setOppStageTarget(r)}>Update Stage</Button>
            )}
          />
        )
      )}

      {/* ── Tasks Tab ───────────────────────────────────────── */}
      {tab === 'tasks' && (
        tasks.length === 0 ? (
          <EmptyState title="No tasks" description="Create tasks for your projects." action={{ label: 'Add Task', onClick: openAddTask }} />
        ) : taskViewMode === 'gantt' ? (
          <GanttChart tasks={tasks} />
        ) : (
          <DataTable
            columns={[
              { key: 'title', header: 'Title', sortable: true, render: (r) => <strong className="text-gray-900">{String(r.title)}</strong> },
              { key: 'projectId', header: 'Project', render: (r) => <span className="text-sm text-gray-600">{String(r.projectId || '-')}</span> },
              { key: 'assigneeId', header: 'Assignee', render: (r) => <span className="text-sm text-gray-600">{String(r.assigneeId || '-')}</span> },
              { key: 'status', header: 'Status', render: (r) => <Badge variant={badgeVariant(String(r.status))} dot size="sm">{formatLabel(String(r.status))}</Badge> },
              { key: 'priority', header: 'Priority', render: (r) => <Badge variant={PRIORITY_BADGE[String(r.priority)]?.variant || 'neutral'} size="sm">{formatLabel(String(r.priority))}</Badge> },
              { key: 'dueDate', header: 'Due Date', render: (r) => <span className="text-sm text-gray-600">{String(r.dueDate || '-')}</span> },
            ]}
            data={tasks}
            emptyMessage="No tasks."
            actions={(r) => (
              <Button variant="ghost" size="sm" onClick={() => setTaskStatusTarget(r)}>Update Status</Button>
            )}
          />
        )
      )}

      {/* ── Tickets Tab ──────────────────────────────────────── */}
      {tab === 'tickets' && (
        tickets.length === 0 ? (
          <EmptyState title="No tickets" description="Create a helpdesk ticket." action={{ label: 'Add Ticket', onClick: openAddTicket }} />
        ) : (
          <DataTable
            columns={[
              { key: 'subject', header: 'Subject', sortable: true, render: (r) => <strong className="text-gray-900">{String(r.subject)}</strong> },
              { key: 'contactName', header: 'Contact', render: (r) => <span className="text-sm text-gray-600">{String(r.contactName || '-')}</span> },
              { key: 'status', header: 'Status', render: (r) => <Badge variant={badgeVariant(String(r.status))} dot size="sm">{formatLabel(String(r.status))}</Badge> },
              { key: 'priority', header: 'Priority', render: (r) => <Badge variant={PRIORITY_BADGE[String(r.priority)]?.variant || 'neutral'} size="sm">{formatLabel(String(r.priority))}</Badge> },
              { key: 'assignedTo', header: 'Assigned', render: (r) => <span className="text-sm text-gray-600">{String(r.assignedTo || '-')}</span> },
            ]}
            data={tickets}
            emptyMessage="No tickets."
            actions={(r) => (
              <Button variant="ghost" size="sm" onClick={() => setTicketCommentTarget(r)}>Add Comment</Button>
            )}
          />
        )
      )}

      {/* ── Knowledge Tab ───────────────────────────────────── */}
      {tab === 'knowledge' && (
        articles.length === 0 ? (
          <EmptyState title="No articles" description="Create knowledge base articles for your team." action={{ label: 'Add Article', onClick: openAddKB }} />
        ) : (
          <DataTable
            columns={[
              { key: 'title', header: 'Title', sortable: true, render: (r) => <strong className="text-gray-900">{String(r.title)}</strong> },
              { key: 'category', header: 'Category', render: (r) => <span className="text-sm text-gray-600">{String(r.category || '-')}</span> },
              { key: 'isPublished', header: 'Published', render: (r) => <Badge variant={r.isPublished ? 'success' : 'neutral'} dot size="sm">{r.isPublished ? 'Published' : 'Draft'}</Badge> },
            ]}
            data={articles}
            emptyMessage="No articles."
            actions={(r) => (
              <Button variant="ghost" size="sm" onClick={() => openEditKB(r)}>Edit</Button>
            )}
          />
        )
      )}

      {/* ── Contact Form Modal ─────────────────────────────── */}
      <FormModal open={showContactForm} title={editingContactId ? 'Edit Contact' : 'Add Contact'} onClose={() => { setShowContactForm(false); setEditingContactId(null); }} onSubmit={handleSaveContact} submitLabel={saving ? 'Saving...' : editingContactId ? 'Update' : 'Save'} submitDisabled={saving}>
        <div className="space-y-4">
          <Select label="Type" options={CONTACT_TYPE_OPTIONS} value={contactForm.type} onChange={(e) => setContactForm((p) => ({ ...p, type: e.target.value }))} />
          <Input label="Name *" type="text" value={contactForm.name} onChange={(e) => setContactForm((p) => ({ ...p, name: e.target.value }))} placeholder="Full name or company" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Email" type="email" value={contactForm.email} onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))} />
            <Input label="Phone" type="tel" value={contactForm.phone} onChange={(e) => setContactForm((p) => ({ ...p, phone: e.target.value }))} />
          </div>
          <Input label="Address" type="text" value={contactForm.address} onChange={(e) => setContactForm((p) => ({ ...p, address: e.target.value }))} />
          <Input label="Industry" type="text" value={contactForm.industry} onChange={(e) => setContactForm((p) => ({ ...p, industry: e.target.value }))} />
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={contactForm.isCustomer} onChange={(e) => setContactForm((p) => ({ ...p, isCustomer: e.target.checked }))} /> Customer</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={contactForm.isVendor} onChange={(e) => setContactForm((p) => ({ ...p, isVendor: e.target.checked }))} /> Vendor</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={contactForm.isLead} onChange={(e) => setContactForm((p) => ({ ...p, isLead: e.target.checked }))} /> Lead</label>
          </div>
          <Input label="Notes" type="text" value={contactForm.notes} onChange={(e) => setContactForm((p) => ({ ...p, notes: e.target.value }))} />
        </div>
      </FormModal>

      {/* ── Lead Form Modal ─────────────────────────────────── */}
      <FormModal open={showLeadForm} title="Add Lead" onClose={() => setShowLeadForm(false)} onSubmit={handleSaveLead} submitLabel={saving ? 'Saving...' : 'Save'} submitDisabled={saving}>
        <div className="space-y-4">
          <Select label="Contact *" options={contacts.map((c) => ({ value: String(c.id), label: String(c.name) }))} value={leadForm.contactId} onChange={(e) => setLeadForm((p) => ({ ...p, contactId: e.target.value }))} />
          <Input label="Source" type="text" value={leadForm.source} onChange={(e) => setLeadForm((p) => ({ ...p, source: e.target.value }))} placeholder="e.g. Website, Referral" />
          <Input label="Assigned To" type="text" value={leadForm.assignedTo} onChange={(e) => setLeadForm((p) => ({ ...p, assignedTo: e.target.value }))} />
          <Input label="Value ($)" type="number" value={leadForm.value} onChange={(e) => setLeadForm((p) => ({ ...p, value: e.target.value }))} min="0" step="0.01" />
          <Input label="Notes" type="text" value={leadForm.notes} onChange={(e) => setLeadForm((p) => ({ ...p, notes: e.target.value }))} />
        </div>
      </FormModal>

      {/* ── Lead Status Modal ────────────────────────────────── */}
      {leadStatusTarget && (
        <FormModal open title="Update Lead Status" onClose={() => setLeadStatusTarget(null)} onSubmit={() => {}} submitLabel="" submitDisabled>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Lead: <strong>{String(leadStatusTarget.contactName || '')}</strong></p>
            <p className="text-sm text-gray-600">Current status: <Badge variant={badgeVariant(String(leadStatusTarget.status))} dot size="sm">{formatLabel(String(leadStatusTarget.status))}</Badge></p>
            <div className="flex flex-wrap gap-2 pt-2">
              {LEAD_STATUS_OPTIONS.filter((o) => o.value !== leadStatusTarget.status).map((o) => (
                <Button key={o.value} variant="secondary" size="sm" onClick={() => handleLeadStatus(o.value)}>{o.label}</Button>
              ))}
            </div>
          </div>
        </FormModal>
      )}

      {/* ── Opportunity Form Modal ──────────────────────────── */}
      <FormModal open={showOppForm} title="Add Opportunity" onClose={() => setShowOppForm(false)} onSubmit={handleSaveOpp} submitLabel={saving ? 'Saving...' : 'Save'} submitDisabled={saving}>
        <div className="space-y-4">
          <Input label="Name *" type="text" value={oppForm.name} onChange={(e) => setOppForm((p) => ({ ...p, name: e.target.value }))} placeholder="Deal name" />
          <Input label="Amount ($)" type="number" value={oppForm.amount} onChange={(e) => setOppForm((p) => ({ ...p, amount: e.target.value }))} min="0" step="0.01" />
          <Input label="Probability (%)" type="number" value={oppForm.probability} onChange={(e) => setOppForm((p) => ({ ...p, probability: e.target.value }))} min="0" max="100" />
          <Input label="Expected Close Date" type="date" value={oppForm.expectedCloseDate} onChange={(e) => setOppForm((p) => ({ ...p, expectedCloseDate: e.target.value }))} />
          <Input label="Assigned To" type="text" value={oppForm.assignedTo} onChange={(e) => setOppForm((p) => ({ ...p, assignedTo: e.target.value }))} />
        </div>
      </FormModal>

      {/* ── Opportunity Stage Modal ─────────────────────────── */}
      {oppStageTarget && (
        <FormModal open title="Update Pipeline Stage" onClose={() => setOppStageTarget(null)} onSubmit={() => {}} submitLabel="" submitDisabled>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Opportunity: <strong>{String(oppStageTarget.name)}</strong></p>
            <p className="text-sm text-gray-600">Current stage: <Badge variant={badgeVariant(String(oppStageTarget.stage))} dot size="sm">{formatLabel(String(oppStageTarget.stage))}</Badge></p>
            <div className="flex flex-wrap gap-2 pt-2">
              {OPP_STAGE_OPTIONS.filter((o) => o.value !== oppStageTarget.stage).map((o) => (
                <Button key={o.value} variant="secondary" size="sm" onClick={() => handleOppStage(o.value)}>{o.label}</Button>
              ))}
            </div>
          </div>
        </FormModal>
      )}

      {/* ── Task Form Modal ─────────────────────────────────── */}
      <FormModal open={showTaskForm} title="Add Task" onClose={() => setShowTaskForm(false)} onSubmit={handleSaveTask} submitLabel={saving ? 'Saving...' : 'Save'} submitDisabled={saving}>
        <div className="space-y-4">
          <Input label="Title *" type="text" value={taskForm.title} onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))} placeholder="Task title" />
          <Input label="Description" type="text" value={taskForm.description} onChange={(e) => setTaskForm((p) => ({ ...p, description: e.target.value }))} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select label="Priority" options={TASK_PRIORITY_OPTIONS} value={taskForm.priority} onChange={(e) => setTaskForm((p) => ({ ...p, priority: e.target.value }))} />
            <Input label="Due Date" type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm((p) => ({ ...p, dueDate: e.target.value }))} />
          </div>
          <Input label="Project ID" type="text" value={taskForm.projectId} onChange={(e) => setTaskForm((p) => ({ ...p, projectId: e.target.value }))} />
          <Input label="Assignee ID" type="text" value={taskForm.assigneeId} onChange={(e) => setTaskForm((p) => ({ ...p, assigneeId: e.target.value }))} />
        </div>
      </FormModal>

      {/* ── Task Status Modal ────────────────────────────────── */}
      {taskStatusTarget && (
        <FormModal open title="Update Task Status" onClose={() => setTaskStatusTarget(null)} onSubmit={() => {}} submitLabel="" submitDisabled>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Task: <strong>{String(taskStatusTarget.title)}</strong></p>
            <p className="text-sm text-gray-600">Current status: <Badge variant={badgeVariant(String(taskStatusTarget.status))} dot size="sm">{formatLabel(String(taskStatusTarget.status))}</Badge></p>
            <div className="flex flex-wrap gap-2 pt-2">
              {TASK_STATUS_OPTIONS.filter((o) => o.value !== taskStatusTarget.status).map((o) => (
                <Button key={o.value} variant="secondary" size="sm" onClick={() => handleTaskStatus(o.value)}>{o.label}</Button>
              ))}
            </div>
          </div>
        </FormModal>
      )}

      {/* ── Ticket Form Modal ───────────────────────────────── */}
      <FormModal open={showTicketForm} title="Add Ticket" onClose={() => setShowTicketForm(false)} onSubmit={handleSaveTicket} submitLabel={saving ? 'Saving...' : 'Save'} submitDisabled={saving}>
        <div className="space-y-4">
          <Input label="Subject *" type="text" value={ticketForm.subject} onChange={(e) => setTicketForm((p) => ({ ...p, subject: e.target.value }))} placeholder="Ticket subject" />
          <Input label="Description" type="text" value={ticketForm.description} onChange={(e) => setTicketForm((p) => ({ ...p, description: e.target.value }))} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select label="Priority" options={TASK_PRIORITY_OPTIONS} value={ticketForm.priority} onChange={(e) => setTicketForm((p) => ({ ...p, priority: e.target.value }))} />
            <Input label="Assigned To" type="text" value={ticketForm.assignedTo} onChange={(e) => setTicketForm((p) => ({ ...p, assignedTo: e.target.value }))} />
          </div>
          <Select label="Contact" options={contacts.map((c) => ({ value: String(c.id), label: String(c.name) }))} value={ticketForm.contactId} onChange={(e) => setTicketForm((p) => ({ ...p, contactId: e.target.value }))} />
        </div>
      </FormModal>

      {/* ── Ticket Comment Modal ────────────────────────────── */}
      {ticketCommentTarget && (
        <FormModal open title="Add Comment" onClose={() => { setTicketCommentTarget(null); setCommentText(''); }} onSubmit={handleAddComment} submitLabel="Add Comment">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Ticket: <strong>{String(ticketCommentTarget.subject)}</strong></p>
            <Input label="Comment" type="text" value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Type your comment..." />
          </div>
        </FormModal>
      )}

      {/* ── Knowledge Form Modal ────────────────────────────── */}
      <FormModal open={showKBForm} title={editingKBId ? 'Edit Article' : 'Add Article'} onClose={() => { setShowKBForm(false); setEditingKBId(null); }} onSubmit={handleSaveKB} submitLabel={saving ? 'Saving...' : editingKBId ? 'Update' : 'Save'} submitDisabled={saving}>
        <div className="space-y-4">
          <Input label="Title *" type="text" value={kbForm.title} onChange={(e) => setKbForm((p) => ({ ...p, title: e.target.value }))} placeholder="Article title" />
          <Input label="Content *" type="text" value={kbForm.content} onChange={(e) => setKbForm((p) => ({ ...p, content: e.target.value }))} placeholder="Article content" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Category" type="text" value={kbForm.category} onChange={(e) => setKbForm((p) => ({ ...p, category: e.target.value }))} />
            <Input label="Tags" type="text" value={kbForm.tags} onChange={(e) => setKbForm((p) => ({ ...p, tags: e.target.value }))} placeholder="comma-separated" />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={kbForm.isPublished} onChange={(e) => setKbForm((p) => ({ ...p, isPublished: e.target.checked }))} /> Published</label>
        </div>
      </FormModal>

      {/* ── Delete Confirmation ─────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Contact"
        message={`Are you sure you want to delete "${deleteTarget?.name || ''}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Card>
  );
}
