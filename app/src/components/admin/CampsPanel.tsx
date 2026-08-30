import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useCampsQuery, useSaveCampMutation, useDeleteCampMutation, useProjectMetaQuery, useSaveProjectMetaMutation, useProjectLinksQuery, useCreateProjectLinkMutation, useDeleteProjectLinkMutation } from '@/hooks/useQueryHooks';
import { DataTable } from '@/components/ui/DataTable';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusTag } from '@/components/ui/StatusTag';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import ListingWizard from './ListingWizard';
import DynamicForm from './DynamicForm';
import {
  PROJECT_TYPES,
  PROJECT_TYPE_ORDER,
  getProjectType,
  buildMetaOps,
  isMetaOpsEmpty,
} from '@/lib/project-types';
import type { MetaRow } from '@/lib/project-types';
import type { Camp } from '@/hooks/useAdminData';
import type { ProjectLink } from '@/lib/api';

interface CampsPanelProps {
  onRefreshCamps: () => void;
}

interface CampForm {
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  capacity: string;
  status: string;
  notes: string;
}

const emptyForm: CampForm = {
  name: '',
  location: '',
  startDate: '',
  endDate: '',
  capacity: '',
  status: 'active',
  notes: '',
};

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'planning', label: 'Planning' },
  { value: 'completed', label: 'Completed' },
];

/** Core-form-owned keys — never rendered/diffed by the embedded meta section. */
const CORE_OWNED_META_KEYS = ['notes'];

/** Type-picker options derived from the registry (deterministic order). */
const projectTypeOptions = [
  ...PROJECT_TYPE_ORDER.map((t) => ({ value: t, label: `${PROJECT_TYPES[t].icon} ${PROJECT_TYPES[t].label}` })),
  { value: 'custom', label: '📦 Custom' },
];

/** Link-type choices for cross-project connections (backend default: `connection`). */
const LINK_TYPE_OPTIONS = [
  { value: 'connection', label: 'Connection' },
  { value: 'serves', label: 'Serves' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'transports', label: 'Transports' },
];

/**
 * "Connections" section for the currently edited project — cross-project
 * links backed by /api/projects/links. Lists every link that touches the
 * project (showing the OTHER side's name + type + the link type), lets the
 * admin link the project to any other same-tenant project (excluding self
 * and already-linked projects), and removes links with confirmation.
 */
function ProjectConnections({ projectId, camps }: { projectId: string; camps: Camp[] }) {
  const { data: links, isLoading } = useProjectLinksQuery(projectId);
  const createMutation = useCreateProjectLinkMutation();
  const deleteMutation = useDeleteProjectLinkMutation();
  const [selectedProject, setSelectedProject] = useState('');
  const [linkType, setLinkType] = useState('connection');
  const [removeTarget, setRemoveTarget] = useState<ProjectLink | null>(null);

  const linkList = links ?? [];

  // Projects that can still be linked: every camp except self and any project
  // already touched by an existing link (links are unique per pair + type).
  const linkedIds = new Set<string>();
  for (const link of linkList) {
    linkedIds.add(String(link.a.id));
    linkedIds.add(String(link.b.id));
  }
  const available = camps.filter((c) => String(c.id) !== String(projectId) && !linkedIds.has(String(c.id)));

  /** Return whichever end of the link is NOT the project being edited. */
  const otherOf = (link: ProjectLink) =>
    String(link.a.id) === String(projectId) ? link.b : link.a;

  const handleAdd = () => {
    if (!selectedProject) return;
    createMutation.mutate(
      { projectIdA: projectId, projectIdB: selectedProject, linkType },
      { onSuccess: () => setSelectedProject('') },
    );
  };

  const handleRemove = () => {
    if (!removeTarget) return;
    deleteMutation.mutate(removeTarget.id, {
      onSuccess: () => setRemoveTarget(null),
    });
  };

  return (
    <div className="mt-6 pt-4 border-t border-gray-100" data-testid="project-connections">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-gray-800">Connections</h3>
        <span className="text-xs text-gray-400">{linkList.length} linked</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Link this project to another one of your projects (e.g. a supermarket supplies a camp, or a
        transport company serves it).
      </p>

      {isLoading ? (
        <div className="text-sm text-gray-400 py-2">Loading connections…</div>
      ) : linkList.length === 0 ? (
        <p className="text-sm text-gray-400 py-2" data-testid="connections-empty">
          No connections yet.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg" data-testid="connections-list">
          {linkList.map((link) => {
            const other = otherOf(link);
            return (
              <li key={link.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{other.name}</p>
                  <p className="text-xs text-gray-400">
                    {other.projectType ?? 'project'} · {link.linkType}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRemoveTarget(link)}
                  data-testid={`remove-link-${link.id}`}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3 items-end">
        <Select
          label="Link to project"
          options={available.map((c) => ({ value: String(c.id), label: c.name }))}
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          placeholder={available.length === 0 ? 'No other projects to link' : 'Select a project'}
          disabled={available.length === 0}
          data-testid="link-project-select"
        />
        <Select
          label="Link type"
          options={LINK_TYPE_OPTIONS}
          value={linkType}
          onChange={(e) => setLinkType(e.target.value)}
          data-testid="link-type-select"
        />
        <Button
          variant="secondary"
          size="md"
          onClick={handleAdd}
          disabled={!selectedProject || available.length === 0 || createMutation.isPending}
          data-testid="add-link-button"
        >
          {createMutation.isPending ? 'Adding…' : 'Add'}
        </Button>
      </div>

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove Connection"
        message={`Remove the connection to ${removeTarget ? otherOf(removeTarget).name : ''}?`}
        confirmLabel={deleteMutation.isPending ? 'Removing…' : 'Yes, Remove'}
        danger
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}

/**
 * Projects admin: a tenant can own one or more camps (multi-project). The empty
 * state launches the listing wizard (camp + first room type + rate plan in one
 * flow) for the first project; once a project exists the header toolbar exposes
 * an "Add Project" action so additional projects can be created via the same
 * create form (POST path), and existing ones are edited in place.
 */
export default function CampsPanel({ onRefreshCamps }: CampsPanelProps) {
  const { data: camps, isLoading: loading } = useCampsQuery();
  const { showToast } = useToast();
  const [showWizard, setShowWizard] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CampForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  // Unified-schema editing: which vertical this project is + its custom-field values.
  const [projectType, setProjectType] = useState<string>('camp');
  const [metaValues, setMetaValues] = useState<Record<string, any>>({});
  /** Id the current metaValues were seeded from — guards against re-clobbering user edits when the query refetches. */
  const metaSeededForId = useRef<string | null>(null);

  const typeSchema = getProjectType(projectType);
  const metaQuery = useProjectMetaQuery(showForm && editingId ? editingId : null);
  const metaMutation = useSaveProjectMetaMutation(editingId);

  const saveMutation = useSaveCampMutation(editingId ?? undefined);
  const deleteMutation = useDeleteCampMutation();

  const campList = camps ?? [];

  /**
   * Generic wire→state decode for seeding. Schema-aware decoding happens
   * inside the widgets/buildMetaOps; this just restores native array shapes
   * for multi-value fields regardless of which schema is currently selected,
   * so switching type mid-edit can never mistake an unrendered key for empty.
   */
  const seedDecode = (raw: unknown): unknown => {
    if (typeof raw !== 'string') return raw ?? '';
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch { /* plain string */ }
    return raw;
  };

  // Seed editable meta values once per opened project from the loaded rows.
  // Every row is seeded (not just the active schema's) — see seedDecode.
  useEffect(() => {
    if (!editingId || !metaQuery.isSuccess) return;
    const rows = metaQuery.data ?? [];
    const stamp = `${editingId}:${rows.length}`;
    if (metaSeededForId.current === stamp) return;
    metaSeededForId.current = stamp;
    const seed: Record<string, any> = {};
    for (const row of rows) {
      if (row && typeof row.metaKey === 'string') {
        seed[row.metaKey] = seedDecode(row.metaValue);
      }
    }
    setMetaValues((prev) => ({ ...seed, ...prev }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaQuery.isSuccess, metaQuery.data, editingId]);

  const openEdit = useCallback((camp: Camp) => {
    setEditingId(camp.id);
    setForm({
      name: camp.name || '',
      location: camp.location || '',
      startDate: camp.startDate || '',
      endDate: camp.endDate || '',
      capacity: String(camp.capacity ?? ''),
      status: camp.status || 'active',
      notes: camp.notes || '',
    });
    setProjectType(camp.projectType && PROJECT_TYPES[camp.projectType] ? camp.projectType : 'camp');
    setMetaValues({});
    metaSeededForId.current = null;
    setShowForm(true);
  }, []);

  /**
   * Open the create form in CREATE mode (editingId = null → POST path). All
   * state is reset so a previously edited project's values never leak through.
   */
  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm);
    setProjectType('camp');
    setMetaValues({});
    metaSeededForId.current = null;
    setShowForm(true);
  }, []);

  /**
   * Diff the current schema's meta values against loaded rows and persist the
   * ops. Keys owned by the core form (`notes`) and fields of OTHER schemas are
   * excluded, so changing a project's type never touches foreign data. When
   * nothing changed this is a no-op that still closes + refreshes.
   */
  const persistMetaAndClose = useCallback(() => {
    const finish = () => {
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      setMetaValues({});
      setProjectType('camp');
      metaSeededForId.current = null;
      onRefreshCamps();
    };

    if (!editingId) {
      finish();
      return;
    }
    const rows = (metaQuery.data ?? []) as MetaRow[];
    const ops = buildMetaOps(rows, metaValues, typeSchema.metaFields, CORE_OWNED_META_KEYS);
    if (isMetaOpsEmpty(ops) || !metaQuery.isSuccess) {
      finish();
      return;
    }
    metaMutation.mutate(ops, { onSuccess: finish });
  }, [editingId, metaQuery.data, metaQuery.isSuccess, metaValues, typeSchema, metaMutation, onRefreshCamps]);

  const handleSave = useCallback(() => {
    if (!form.name.trim()) {
      showToast('Project name is required.', 'warning');
      return;
    }
    if (!form.location.trim()) {
      showToast('Project location is required.', 'warning');
      return;
    }
    if (form.startDate && form.endDate) {
      if (new Date(form.startDate) >= new Date(form.endDate)) {
        showToast('Start date must be before end date.', 'warning');
        return;
      }
    }

    saveMutation.mutate(
      {
        name: form.name.trim(),
        location: form.location.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        capacity: parseInt(form.capacity) || 0,
        status: form.status as 'active' | 'inactive' | 'completed',
        notes: form.notes.trim(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        projectType,
      } as any,
      {
        onSuccess: () => {
          persistMetaAndClose();
        },
      },
    );
  }, [form, projectType, editingId, showToast, saveMutation, persistMetaAndClose]);

  const handleDelete = useCallback(() => {
    // Defensive guard: the confirm dialog is only rendered when deleteTarget is set,
    // so this branch is unreachable from the UI. Kept for type-safety.
    /* v8 ignore next */
    if (!deleteTarget) return;

    // Marketplace directory rows carry the owning tenant (tenant_id/tenantId).
    // Forward it so the backend super_admin ?tenantId= override scopes this
    // delete to the right tenant instead of the marketplace header scope.
    const row = campList.find((c) => String(c.id) === String(deleteTarget)) as
      | (Camp & { tenant_id?: string; tenantId?: string })
      | undefined;
    const tenantId = row?.tenant_id ?? row?.tenantId;

    deleteMutation.mutate(
      tenantId ? { id: deleteTarget, tenantId } : deleteTarget,
      {
        onSuccess: () => {
          setDeleteTarget(null);
          onRefreshCamps();
        },
      },
    );
  }, [deleteTarget, deleteMutation, onRefreshCamps, campList]);

  const updateField = (field: keyof CampForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Card padding="none" className="p-6" data-testid="camps-panel">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Projects</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage your projects — camps, supermarkets, and other business locations.</p>
        </div>
        {campList.length > 0 && (
          <Button
            variant="primary"
            size="sm"
            onClick={openCreate}
            data-testid="add-project-button"
            leftIcon={
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            Add Project
          </Button>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={5} columns={5} />
      ) : campList.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create your first project to start managing rooms, rate plans, and reservations."
          action={{ label: 'Create Project', onClick: () => setShowWizard(true) }}
        />
      ) : (
        <DataTable<Camp & Record<string, unknown>>
          columns={[
            { key: 'name', header: 'Name', sortable: true, render: (c) => <strong>{String(c.name)}</strong> },
            { key: 'location', header: 'Location', sortable: true, render: (c) => String(c.location) },
            {
              key: 'startDate',
              header: 'Dates',
              sortable: true,
              render: (c) => `${String(c.startDate)} → ${String(c.endDate)}`,
            },
            { key: 'capacity', header: 'Capacity', sortable: true, render: (c) => String(c.capacity) },
            { key: 'status', header: 'Status', render: (c) => <StatusTag status={String(c.status)} /> },
          ]}
          data={campList as (Camp & Record<string, unknown>)[]}
          emptyMessage="No camps found."
          actions={(c) => (
            <div className="flex gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openEdit(c as unknown as Camp)}
                leftIcon={
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                }
              >
                Edit
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setDeleteTarget(c.id as string)}
                leftIcon={
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                }
              >
                Delete
              </Button>
            </div>
          )}
        />
      )}

      <FormModal
        open={showForm}
        title={editingId ? 'Edit Project' : 'Create Project'}
        size={editingId ? 'lg' : 'md'}
        onClose={() => {
          setShowForm(false);
          setEditingId(null);
          setMetaValues({});
          setProjectType('camp');
          metaSeededForId.current = null;
        }}
        onSubmit={handleSave}
        submitLabel={saveMutation.isPending || metaMutation.isPending ? 'Saving...' : editingId ? 'Update Project' : 'Save Project'}
        submitDisabled={saveMutation.isPending || metaMutation.isPending || (showForm && !!editingId && !metaQuery.isSuccess)}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Project Type"
            options={projectTypeOptions}
            value={projectType}
            onChange={(e) => setProjectType(e.target.value)}
          />
          <Input
            label="Name *"
            type="text"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Project name"
          />
          <div className="md:col-span-2">
            <label htmlFor="camp-location" className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
            <input
              id="camp-location"
              type="text"
              value={form.location}
              onChange={(e) => updateField('location', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:border-brand-500 focus:ring-brand-500"
              placeholder="Paste Google Maps link or type address"
            />
            <p className="text-xs text-gray-400 mt-1">
              Tip: Paste a Google Maps link (e.g., https://maps.google.com/?q=...) and it will auto-embed the map. Or type a simple address.
            </p>
          </div>
          <Input
            label="Start Date"
            type="date"
            value={form.startDate}
            onChange={(e) => updateField('startDate', e.target.value)}
          />
          <Input
            label="End Date"
            type="date"
            value={form.endDate}
            onChange={(e) => updateField('endDate', e.target.value)}
          />
          <Input
            label="Capacity"
            type="number"
            value={form.capacity}
            onChange={(e) => updateField('capacity', e.target.value)}
            placeholder="0"
            min="0"
          />
          <Select
            label="Status"
            options={statusOptions}
            value={form.status}
            onChange={(e) => updateField('status', e.target.value)}
          />
          <div className="md:col-span-2">
            <label htmlFor="camp-notes" className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              id="camp-notes"
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:border-brand-500 focus:ring-brand-500"
              rows={3}
              placeholder="Additional notes..."
            />
          </div>
        </div>

        {/* Unified-schema custom fields for the selected vertical. Core-owned
            keys (notes) and other schemas' keys are never rendered or diffed
            here — see buildMetaOps in lib/project-types. */}
        <div className="mt-6 pt-4 border-t border-gray-100">
          <DynamicForm
            schema={typeSchema}
            values={{}}
            metaValues={metaValues}
            onChange={() => { /* core fields owned by the grid above */ }}
            onMetaChange={(key, value) => setMetaValues((prev) => ({ ...prev, [key]: value }))}
            fields="meta"
            excludeMetaKeys={CORE_OWNED_META_KEYS}
          />
        </div>

        {/* Cross-project connections — only meaningful once the project exists
            (edit mode), so hide it during CREATE. */}
        {showForm && editingId && (
          <ProjectConnections projectId={editingId} camps={campList} />
        )}
      </FormModal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Project"
        message="Delete this project? This will also remove ALL associated rooms, reservations, staff, expenses, inventory, and plans!"
        confirmLabel={deleteMutation.isPending ? 'Deleting...' : 'Delete'}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ListingWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onCreated={onRefreshCamps}
      />
    </Card>
  );
}
