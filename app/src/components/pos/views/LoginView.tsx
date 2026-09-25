import { useState } from 'react';
import { LoginForm } from '@/components/shell/LoginForm';
import { getCamps } from '@/lib/api';
import { session } from '@/lib/session';
import type { PosUser } from '../types';
import ProjectPicker, { type PosProject } from './ProjectPicker';

/**
 * POS login view — Phase 4d project/store selection (design §6.3).
 *
 * Flow: credentials (shared shell LoginForm, realm="pos") → tenant project
 * directory (`GET /projects`, public + tenant-hinted, same call the
 * marketplace uses) → either straight into the terminal or through an
 * explicit project/store picker:
 *
 * - single ⇒ none: the login response carries a bound projectId and the
 *   tenant owns ≤1 project — the bound project is implicit, no picker.
 * - multi/null ⇒ picker: several projects to choose from, or a NULL
 *   project binding (unbound store — the server scopes to the tenant
 *   default). One store per project under Option Y, so picking the project
 *   IS picking the store.
 *
 * Server-authoritative: the token binding minted at login is never
 * rewritten client-side. A mismatched pick is blocked in the picker with
 * the server binding quoted (writes outside it fail closed server-side,
 * 403 project scope mismatch — 4c). Server 4xxs from the directory fetch
 * surface verbatim with a retry; a "continue without selection" escape
 * keeps login from hard-blocking on a directory outage (shell then shows
 * the raw project id fallback).
 *
 * The confirmed (or implicit) active project name is merged into the
 * persisted POS user blob so the shell header survives reloads.
 */
type Phase = 'credentials' | 'resolving' | 'picker' | 'directory-error';

function resolveActiveProject(user: PosUser, projects: PosProject[]): { id: string | null; name: string | null } {
  const boundId = user.projectId ?? null;
  if (!boundId) return { id: null, name: null };
  const match = projects.find((p) => p.id === boundId);
  return { id: boundId, name: match?.name ?? null };
}

export default function LoginView({ onLogin }: { onLogin: (u: PosUser, t: string) => void }) {
  const [phase, setPhase] = useState<Phase>('credentials');
  const [authed, setAuthed] = useState<{ user: PosUser; token: string } | null>(null);
  const [projects, setProjects] = useState<PosProject[]>([]);
  const [directoryError, setDirectoryError] = useState('');

  async function loadDirectory(user: PosUser, token: string) {
    setPhase('resolving');
    setDirectoryError('');
    try {
      const list = (await getCamps()) as PosProject[];
      const rows = Array.isArray(list) ? list : [];
      setProjects(rows);
      const active = resolveActiveProject(user, rows);
      const enriched: PosUser = {
        ...user,
        activeProjectId: active.id ?? user.activeProjectId ?? null,
        activeProjectName: active.name ?? user.activeProjectName ?? null,
      };
      session.setUser('pos', enriched);
      // Single-store cashiers see no picker — the implicit bound project.
      if (user.projectId != null && rows.length <= 1) {
        onLogin(enriched, token);
        return;
      }
      // Multi-store / null-store cashiers get the explicit picker.
      setAuthed({ user: enriched, token });
      setPhase('picker');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load projects';
      setDirectoryError(message);
      setPhase('directory-error');
    }
  }

  function handleCredentialsSuccess(user: PosUser, token: string) {
    // LoginForm already persisted tokens/user through the session kernel.
    // Stash the session first so the directory-error escape hatches (retry /
    // continue without selection) have something to work with.
    setAuthed({ user, token });
    void loadDirectory(user, token);
  }

  function handlePickerConfirm(project: PosProject) {
    if (!authed) return;
    const enriched: PosUser = { ...authed.user, activeProjectId: project.id, activeProjectName: project.name };
    session.setUser('pos', enriched);
    onLogin(enriched, authed.token);
  }

  function handleContinueWithoutSelection() {
    if (!authed) {
      // Directory failed before any session existed — nothing to continue with.
      setPhase('credentials');
      return;
    }
    onLogin(authed.user, authed.token);
  }

  if (phase === 'picker' && authed) {
    return <ProjectPicker user={authed.user} projects={projects} onConfirm={handlePickerConfirm} />;
  }

  if (phase === 'directory-error') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-warm-100" data-testid="pos-directory-error">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-warm-100 shadow-elevated p-6 sm:p-8 text-center">
          <h1 className="font-display text-xl font-bold text-gray-900 mb-2">Couldn’t load projects</h1>
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4" data-testid="pos-directory-error-text">
            {directoryError}
          </p>
          <button
            type="button"
            onClick={() => authed && void loadDirectory(authed.user, authed.token)}
            data-testid="pos-directory-retry"
            className="w-full p-3.5 rounded-lg text-sm font-bold text-white bg-green-700 hover:bg-green-800 cursor-pointer border-none mb-2"
          >
            Retry
          </button>
          {authed && (
            <button
              type="button"
              onClick={handleContinueWithoutSelection}
              data-testid="pos-picker-continue"
              className="w-full p-3 rounded-lg text-sm font-semibold text-gray-700 bg-transparent hover:bg-gray-100 cursor-pointer border border-gray-300"
            >
              Continue without project selection
            </button>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'resolving') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-warm-100" data-testid="pos-login-resolving">
        <p className="text-sm text-warm-500">Loading your projects…</p>
      </div>
    );
  }

  return <LoginForm realm="pos" onPosSuccess={handleCredentialsSuccess} />;
}
