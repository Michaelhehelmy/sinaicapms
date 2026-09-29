/**
 * Client error reporter → campmaster-monitor intake.
 *
 * Sends uncaught errors (window.onerror / unhandledrejection), TanStack query
 * failures (via the shared `useErrorToast` choke point in useQueryHooks), and
 * tester feedback copies (via DebugFeedbackWidget) to the standalone monitor
 * worker (`POST {REPORT_URL}/report/error` + `POST {REPORT_URL}/report/feedback`).
 *
 * Token semantics (write-only, safe for the client bundle):
 * - `PUBLIC_REPORT_TOKEN` is a PUBLIC Astro env var (`import.meta.env`) — it
 *   ships in client JS by design. It is write-only: the monitor intake accepts
 *   it solely to APPEND error/feedback rows (201 `{id, kind, status: "new"}`),
 *   throttled at 60/min per IP. It cannot read status, history, reports, or
 *   the operator dashboard (those need `DASHBOARD_TOKEN`, which must NEVER be
 *   exposed client-side — set it only via `wrangler secret put` on the
 *   monitor worker).
 * - Token ABSENT ⇒ every entry point is a silent no-op: no fetch, no throw,
 *   no console spam. Local dev and E2E run tokenless and behave exactly as
 *   before this module existed.
 *
 * Transport: `fetch` with `keepalive: true` (the report survives page unload)
 * and a silent `.catch()` — reporting must never break the caller.
 */

const DEFAULT_REPORT_URL = 'https://status.sinaicamps.com';
const ERROR_PATH = '/report/error';
const FEEDBACK_PATH = '/report/feedback';

/** Monitor intake caps (mirrors REPORT_BODY_LIMITS in monitor/src/index.js). */
const MAX_MESSAGE = 2000;

function readPublicEnv(key: 'PUBLIC_REPORT_URL' | 'PUBLIC_REPORT_TOKEN'): string {
  try {
    const value = import.meta.env[key];
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

export interface ReportConfigInput {
  PUBLIC_REPORT_URL?: string;
  PUBLIC_REPORT_TOKEN?: string;
}

/**
 * Pure URL/token resolver (unit-testable without re-importing the module).
 * `PUBLIC_REPORT_URL` overrides the default monitor origin (staging/local
 * monitor); a blank value falls back to the default. Trailing slashes are
 * stripped so path joins stay clean.
 */
export function resolveReportConfig(env?: ReportConfigInput): { url: string; token: string } {
  const rawUrl = (env?.PUBLIC_REPORT_URL ?? readPublicEnv('PUBLIC_REPORT_URL')).trim();
  const token = (env?.PUBLIC_REPORT_TOKEN ?? readPublicEnv('PUBLIC_REPORT_TOKEN')).trim();
  return { url: (rawUrl || DEFAULT_REPORT_URL).replace(/\/+$/, ''), token };
}

/** Monitor origin for `POST /report/error` + `POST /report/feedback`. */
export const REPORT_URL: string = resolveReportConfig().url;

/**
 * Write-only intake token (`PUBLIC_REPORT_TOKEN`). Empty unless the deploy
 * environment provides it — see the module docblock for why an absent token
 * is a safe silent no-op and why a present one is safe to ship client-side.
 */
export const PUBLIC_REPORT_TOKEN: string = resolveReportConfig().token;

function currentPageUrl(explicit?: string | null): string | null {
  if (explicit) return explicit;
  try {
    if (typeof window !== 'undefined' && window.location && window.location.href) {
      return window.location.href;
    }
  } catch {
    /* SSR / restricted context — fall through to null */
  }
  return null;
}

function postReport(path: typeof ERROR_PATH | typeof FEEDBACK_PATH, body: Record<string, unknown>): void {
  if (!PUBLIC_REPORT_TOKEN) return;
  try {
    if (typeof fetch !== 'function') return;
    void fetch(`${REPORT_URL}${path}`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PUBLIC_REPORT_TOKEN}`,
      },
      body: JSON.stringify(body),
    }).catch(() => {
      /* intake failure must never surface */
    });
  } catch {
    /* reporting must never break the caller */
  }
}

export interface ReportErrorOptions {
  pageUrl?: string | null;
  contact?: string | null;
}

/**
 * Report an error string to the monitor. Silent no-op when the token is
 * absent or the message is blank. Never throws, never logs.
 */
export function reportError(message: string, opts?: ReportErrorOptions): void {
  const text = String(message ?? '').trim();
  if (!text) return;
  postReport(ERROR_PATH, {
    message: text.slice(0, MAX_MESSAGE),
    page_url: currentPageUrl(opts?.pageUrl),
    contact: opts?.contact ?? null,
  });
}

export interface ReportFeedbackInput {
  message: string;
  pageUrl?: string | null;
  contact?: string | null;
}

/**
 * Report a tester-feedback copy to the monitor (`POST /report/feedback`).
 * Fire-and-forget companion to the primary D1 `submitFeedback` submit — the
 * widget never awaits this. Same silent no-op / never-throw contract.
 */
export function reportFeedback(input: ReportFeedbackInput): void {
  const text = String(input?.message ?? '').trim();
  if (!text) return;
  postReport(FEEDBACK_PATH, {
    message: text.slice(0, MAX_MESSAGE),
    page_url: currentPageUrl(input?.pageUrl),
    contact: input?.contact ?? null,
  });
}

let installed = false;

/**
 * Install the global browser error hooks once (idempotent): `window.onerror`
 * + `window.onunhandledrejection` (previous handlers preserved and still
 * invoked; property assignment — not addEventListener — so installs compose
 * predictably and never stack duplicates). SSR-safe — no-ops without
 * `window`. Never throws.
 */
export function initErrorReporting(): void {
  if (installed) return;
  try {
    if (typeof window === 'undefined') return;
    installed = true;
    const prevOnError = window.onerror;
    window.onerror = function (message, _source, _lineno, _colno, error) {
      try {
        const text =
          error instanceof Error
            ? error.stack || `${error.name}: ${error.message}`
            : String(message ?? 'window.onerror');
        reportError(text);
      } catch {
        /* never break the page error path */
      }
      try {
        if (typeof prevOnError === 'function') {
          return prevOnError.call(this, message, _source, _lineno, _colno, error);
        }
      } catch {
        /* a throwing previous handler must not take down reporting */
      }
      return false;
    };
    const prevRejection = window.onunhandledrejection;
    window.onunhandledrejection = function (event) {
      try {
        const reason = (event as PromiseRejectionEvent).reason;
        reportError(
          reason instanceof Error
            ? reason.stack || `${reason.name}: ${reason.message}`
            : String(reason ?? 'unhandledrejection'),
        );
      } catch {
        /* never break the rejection path */
      }
      try {
        if (typeof prevRejection === 'function') {
          return (prevRejection as (this: Window, ev: PromiseRejectionEvent) => unknown).call(
            window,
            event,
          );
        }
      } catch {
        /* a throwing previous handler must not take down reporting */
      }
      return false;
    };
  } catch {
    /* init must never break page boot */
  }
}
