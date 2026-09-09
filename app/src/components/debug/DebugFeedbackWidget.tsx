/**
 * DebugFeedbackWidget — floating human-testing feedback launcher.
 *
 * Self-contained on purpose: it must work on EVERY surface — admin SPA, POS
 * SPA, and public pages — with or without AuthProvider/ToastProvider. Identity
 * is best-effort from the session kernel (admin realm first, then pos realm);
 * public visitors submit anonymously (category + message + optional personal
 * view).
 *
 * Visibility rules:
 *  - admin/pos sessions → always available (testers are the logged-in users).
 *  - public pages → only after `?debug=1` set the `sc_debug` flag (regular
 *    visitors never see the button).
 *
 * Screenshot: html2canvas is loaded on demand (dynamic import) when the modal
 * opens, then downscaled to ≤1280px JPEG (~150 KB) so D1 rows stay small. A
 * capture failure never blocks submission.
 */

import React, { useCallback, useEffect, useId, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { session } from '@/lib/session';
import type { FeedbackAuthorType, FeedbackCategory } from '@/lib/api';

/* ── Debug flag (public surface gating) ─────────────────────────── */

const DEBUG_FLAG_KEY = 'sc_debug';
const DEBUG_FLAG_VALUE = '1';

/** Set the debug flag from `?debug=1`; clear from `?debug=0`. Mount-time. */
export function ensureDebugFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === '1') {
      window.localStorage.setItem(DEBUG_FLAG_KEY, DEBUG_FLAG_VALUE);
      return true;
    }
    if (params.get('debug') === '0') {
      window.localStorage.removeItem(DEBUG_FLAG_KEY);
      return false;
    }
    // The layout's inline script strips `?debug=1` (history.replaceState)
    // immediately after persisting the `sc_debug` cookie — so by hydration
    // time the query is gone but the cookie is set. Trust either signal.
    if (window.localStorage.getItem(DEBUG_FLAG_KEY) === DEBUG_FLAG_VALUE) return true;
    return document.cookie.includes('sc_debug=1');
  } catch {
    return false;
  }
}

/* ── Identity resolution (session kernel; never throws) ──────────── */

interface WidgetIdentity {
  authorType: FeedbackAuthorType;
  authorName: string | null;
  authorEmail: string | null;
  role: string | null;
}

function resolveIdentity(): WidgetIdentity {
  if (typeof window === 'undefined') {
    return { authorType: 'public', authorName: null, authorEmail: null, role: null };
  }
  try {
    const admin = session.getUser<Record<string, unknown>>('admin');
    if (admin) {
      const name =
        (admin.fullName as string) ||
        ([admin.firstName, admin.lastName].filter(Boolean).join(' ') as string) ||
        (admin.name as string) ||
        null;
      return {
        authorType: 'admin',
        authorName: name,
        authorEmail: (admin.email as string) || null,
        role: (admin.role as string) || null,
      };
    }
    const pos = session.getUser<Record<string, unknown>>('pos');
    if (pos) {
      const name =
        (pos.fullName as string) ||
        ([pos.firstName, pos.lastName].filter(Boolean).join(' ') as string) ||
        (pos.name as string) ||
        null;
      return {
        authorType: 'pos',
        authorName: name,
        authorEmail: (pos.email as string) || null,
        role: (pos.role as string) || null,
      };
    }
  } catch {
    // session read never blocks rendering
  }
  return { authorType: 'public', authorName: null, authorEmail: null, role: null };
}

/* ── Screenshot capture ──────────────────────────────────────────── */

const MAX_SCREENSHOT_STR = 600_000; // mirror of backend MAX_SCREENSHOT_STR
const TARGET_MAX_WIDTH = 1280;

async function captureScreenshot(): Promise<string | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  try {
    const mod = await import('html2canvas');
    const html2canvas = mod.default;
    const canvas = await html2canvas(document.body, {
      scale: Math.min(window.devicePixelRatio || 1, 2),
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
      windowWidth: window.document.documentElement.clientWidth,
    });

    let width = canvas.width;
    let height = canvas.height;
    const scale = Math.min(1, TARGET_MAX_WIDTH / width);
    width = Math.max(320, Math.round(width * scale));
    height = Math.max(240, Math.round(height * scale));

    const resized = document.createElement('canvas');
    resized.width = width;
    resized.height = height;
    const ctx = resized.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0, width, height);

    let dataUrl = resized.toDataURL('image/jpeg', 0.65);
    // Safety net: if still oversized, drop to half the pixel budget once.
    if (dataUrl.length > MAX_SCREENSHOT_STR) {
      const halfW = Math.round(width / 2);
      const halfH = Math.round(height / 2);
      const smaller = document.createElement('canvas');
      smaller.width = halfW;
      smaller.height = halfH;
      const sctx = smaller.getContext('2d');
      if (!sctx) return dataUrl;
      sctx.drawImage(resized, 0, 0, halfW, halfH);
      dataUrl = smaller.toDataURL('image/jpeg', 0.5);
    }
    return dataUrl.length > MAX_SCREENSHOT_STR ? null : dataUrl;
  } catch {
    return null;
  }
}

/* ── Widget ──────────────────────────────────────────────────────── */

const CATEGORY_OPTIONS: { value: FeedbackCategory; label: string; hint: string }[] = [
  { value: 'bug', label: 'Bug', hint: 'Something is broken or errors out' },
  { value: 'missing', label: 'Missing', hint: 'A feature/field that should exist but does not' },
  { value: 'flow', label: 'Flow', hint: 'A sequence that feels illogical or confusing' },
];

export function DebugFeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [personalView, setPersonalView] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const titleId = useId();

  // Identity is resolved LAZILY, not at module scope: at AdminShell mount the
  // session may still be empty (login resolves afterwards), so memoizing once
  // here would fix the widget to 'public' forever and hide it on admin/POS.
  // We hold it in state, re-resolve when the modal opens, and react to
  // session change events (login / logout) via the session kernel.
  const [identity, setIdentity] = useState<WidgetIdentity>(() => resolveIdentity());

  // Public surfaces: hide unless the tester enabled the debug flag. Admin/POS
  // sessions are always allowed — but the session may arrive AFTER mount, so
  // this re-evaluates on every auth change.
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      if (identity.authorType !== 'public') return true;
      return ensureDebugFlag();
    } catch {
      return false;
    }
  });

  useEffect(() => {
    return session.onAuthChange(() => {
      const next = resolveIdentity();
      setIdentity(next);
      setEnabled(() => {
        if (next.authorType !== 'public') return true;
        return ensureDebugFlag();
      });
    });
  }, []);

  // A visible?debug=1 on the current URL is plenty to reveal the widget.
  useEffect(() => {
    if (!enabled && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('debug') === '1') setEnabled(true);
    }
  }, [enabled]);

  const openModal = useCallback(async () => {
    // Re-resolve identity — the session may have settled since mount.
    setIdentity(resolveIdentity());
    setOpen(true);
    setError(null);
    setScreenshotError(false);
    if (typeof window === 'undefined') return;
    try {
      const url = new URLSearchParams(window.location.search);
      if (url.get('debug') === '1') {
        window.localStorage.setItem(DEBUG_FLAG_KEY, DEBUG_FLAG_VALUE);
      }
    } catch {
      // ignore
    }
    setCapturing(true);
    const shot = await captureScreenshot();
    setScreenshot(shot || null);
    setScreenshotError(!shot);
    setCapturing(false);
  }, []);

  const closeModal = useCallback(() => {
    if (submitting) return;
    setOpen(false);
  }, [submitting]);

  const handleSubmit = useCallback(async () => {
    if (!category || !message.trim()) {
      setError('Category and message are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { submitFeedback } = await import('@/lib/api');
      const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
      await submitFeedback({
        category,
        message: message.trim(),
        personalView: personalView.trim() || null,
        pageUrl,
        authorType: identity.authorType,
        authorName: identity.authorName,
        authorEmail: identity.authorEmail,
        role: identity.role,
        userAgent,
        screenshot,
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  }, [category, message, personalView, screenshot, identity]);

  const resetAndClose = useCallback(() => {
    setSent(false);
    setMessage('');
    setPersonalView('');
    setScreenshot(null);
    setScreenshotError(false);
    setError(null);
    setOpen(false);
  }, []);

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        data-testid="debug-feedback-open"
        aria-label="Open debug feedback"
        className="fixed bottom-4 right-4 z-[120] inline-flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4H4a2 2 0 00-2 2v2m9-4a9 9 0 016.4 2.6A9 9 0 0120 11m-9-7V3m0 1H4m16 0a2 2 0 00-2-2h-2m-3 4a5 5 0 00-5 5v5a2 2 0 002 2h6a2 2 0 002-2v-5a5 5 0 00-5-5z" />
        </svg>
      </button>

      <Modal
        isOpen={open}
        onClose={closeModal}
        title={sent ? 'Feedback sent' : 'Report a testing finding'}
        testId="debug-feedback-modal"
        contentTestId="debug-feedback-content"
        size="md"
        footer={
          sent ? (
            <Button variant="primary" onClick={resetAndClose} data-testid="debug-feedback-done">
              Done
            </Button>
          ) : (
            <div className="flex w-full items-center justify-between gap-2">
              <p className="text-xs text-gray-500" data-testid="debug-feedback-capture-status">
                {capturing
                  ? 'Capturing screenshot…'
                  : screenshotError
                    ? 'Screenshot unavailable — sending text only'
                    : 'Screenshot attached'}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={closeModal} disabled={submitting}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleSubmit} loading={submitting} data-testid="debug-feedback-submit">
                  Send to super admin
                </Button>
              </div>
            </div>
          )
        }
      >
        {sent ? (
          <p className="text-sm text-gray-600">
            Thanks! Your report reached the super admin. A screenshot
            {screenshot ? ' was attached' : ' could not be attached'} with your message.
          </p>
        ) : (
          <div className="space-y-4">
          <div role="radiogroup" aria-label="Issue category" className="space-y-2">
            {CATEGORY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition-colors',
                  category === opt.value
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-warm-200 bg-white hover:border-brand-300',
                )}
              >
                <input
                  type="radio"
                  name="debug-feedback-category"
                  value={opt.value}
                  checked={category === opt.value}
                  onChange={() => setCategory(opt.value)}
                  className="mt-0.5 accent-brand-600"
                  data-testid={`debug-feedback-category-${opt.value}`}
                />
                <span>
                  <span className="block font-medium text-gray-900">{opt.label}</span>
                  <span className="block text-xs text-gray-500">{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>

          <div>
            <label htmlFor={`${titleId}-message`} className="mb-1 block text-sm font-medium text-gray-700">
              What happened? <span className="text-error-600">*</span>
            </label>
            <textarea
              id={`${titleId}-message`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Describe the bug, the missing piece, or the confusing flow…"
              className="w-full rounded-lg border border-warm-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              data-testid="debug-feedback-message"
            />
          </div>

          <div>
            <label htmlFor={`${titleId}-view`} className="mb-1 block text-sm font-medium text-gray-700">
              Your personal point of view <span className="text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              id={`${titleId}-view`}
              value={personalView}
              onChange={(e) => setPersonalView(e.target.value)}
              rows={2}
              placeholder="As a tester, how does this feel? What would make sense to you?"
              className="w-full rounded-lg border border-warm-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              data-testid="debug-feedback-personal-view"
            />
          </div>

          {error && (
            <p className="text-sm text-error-600" role="alert" data-testid="debug-feedback-error">
              {error}
            </p>
          )}

          <p className="text-xs text-gray-400">
            Sent from {identity.authorType === 'public' ? 'a public page' : `the ${identity.authorType} interface`}
            {identity.authorName ? ` as ${identity.authorName}` : ''} — your page URL and browser details are attached.
          </p>
        </div>
        )}
      </Modal>
    </>
  );
}

export default DebugFeedbackWidget;