import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { IconCamps } from '@/components/ui/icons';
import type { components } from '@/lib/api-types';
import type { PosUser } from '../types';

export type PosProject = components['schemas']['Camp'];

/**
 * Phase 4d — POS login project/store picker (design §6.3).
 *
 * Option Y binds one store per project, so picking the project IS picking
 * the store. Shown only when the login response is ambiguous:
 * - multi-project tenants (several stores to choose from), or
 * - NULL project binding (store carries no project — server scopes to the
 *   tenant default, the cashier explicitly acknowledges a project).
 * Single-store cashiers never see this (bound project is implicit).
 *
 * The server stays authoritative: the token's bound project (from login)
 * is the only selection that can proceed. A mismatched pick is blocked
 * here with the server binding quoted — activity outside the assigned
 * project is rejected server-side (403 project scope mismatch on writes,
 * 4c), so letting it through would only manufacture 403s in the terminal.
 * No project switcher is offered to guests — POS staff only.
 */
export default function ProjectPicker({
  user,
  projects,
  onConfirm,
}: {
  user: PosUser;
  projects: PosProject[];
  onConfirm: (project: PosProject) => void;
}) {
  const boundId = user.projectId ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(boundId);
  const [mismatch, setMismatch] = useState('');

  const selected = projects.find((p) => p.id === selectedId) ?? null;
  const bound = projects.find((p) => p.id === boundId) ?? null;

  function handleConfirm() {
    if (!selected) return;
    // Mismatch guard: the server bound this session to `boundId` at login.
    // A different pick would be rejected server-side — block it here and
    // quote the binding so the cashier knows why.
    if (boundId && selected.id !== boundId) {
      setMismatch(
        `Project “${selected.name}” is not assigned to this terminal — the server bound this session to “${bound?.name ?? boundId}”. ` +
          `Mismatched activity is rejected by the server (403).`,
      );
      return;
    }
    setMismatch('');
    onConfirm(selected);
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-warm-100" data-testid="pos-project-picker">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-warm-100 shadow-elevated p-6 sm:p-8">
        <div className="text-center mb-6">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-4 ring-brand-100"
            aria-hidden="true"
          >
            <IconCamps size={30} />
          </div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Select project</h1>
          <p className="text-sm text-warm-500 mt-1">
            {boundId
              ? 'Your terminal serves several projects — pick the one for this shift.'
              : 'Your account has no bound project — pick the project for this shift. The server scopes activity to the tenant default.'}
          </p>
        </div>
        {mismatch && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm" data-testid="pos-picker-error">
            {mismatch}
          </div>
        )}
        <div role="radiogroup" aria-label="Projects" className="space-y-2 mb-6">
          {projects.map((project) => {
            const isAssigned = boundId != null && project.id === boundId;
            const checked = selectedId === project.id;
            return (
              <label
                key={project.id}
                data-testid={`pos-project-option-${project.id}`}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                  checked ? 'border-brand-600 bg-brand-50' : 'border-warm-100 bg-white hover:border-brand-300'
                }`}
              >
                <input
                  type="radio"
                  name="pos-project"
                  value={project.id}
                  checked={checked}
                  onChange={() => {
                    setSelectedId(project.id);
                    setMismatch('');
                  }}
                  className="h-4 w-4 accent-brand-600"
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-gray-900 truncate">{project.name}</span>
                  {project.location && (
                    <span className="block text-xs text-warm-500 truncate">{project.location}</span>
                  )}
                </span>
                {isAssigned && (
                  <span className="shrink-0 text-[11px] font-semibold text-brand-700 bg-brand-50 border border-brand-200 rounded-full px-2 py-0.5">
                    Assigned
                  </span>
                )}
              </label>
            );
          })}
        </div>
        <Button
          type="button"
          variant="primary"
          size="lg"
          fullWidth
          disabled={!selected}
          onClick={handleConfirm}
          data-testid="pos-picker-confirm"
          className="btn-primary min-h-[52px]"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
