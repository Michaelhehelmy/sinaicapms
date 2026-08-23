// Phase 7 / Task 1 — SPA navigation kernel (Unified Architecture Plan §4.2).
//
// pushState router shared by every SPA surface (POS first, then admin).
// Zero full-reload navigations: push/replace mutate the URL through the
// History API and broadcast to subscribers; back() rides the popstate
// listener installed lazily by the first onNavigation() subscription.
//
// Hash-fallback parsing keeps pre-kernel deep links (`#tab=<id>`) resolving
// during the admin migration window.

export interface NavigationEvent {
  /** URL pathname after the navigation */
  path: string;
  /** full href after the navigation */
  url: string;
}

type NavigationListener = (event: NavigationEvent) => void;

const listeners = new Set<NavigationListener>();
let installed = false;

function emit(): void {
  if (typeof window === 'undefined') return;
  const event: NavigationEvent = { path: window.location.pathname, url: window.location.href };
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      /* a broken listener must never break routing */
    }
  });
}

function install(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('popstate', emit);
}

/** Navigate forward — adds a history entry. */
export function push(path: string): void {
  if (typeof window === 'undefined') return;
  // A URL without a fragment also CLEARS any stale `#tab=` hash left over
  // from pre-kernel deep links (pushState replaces the full URL).
  window.history.pushState({ nav: Date.now() }, '', path);
  emit();
}

/** Navigate in place — replaces the current history entry. */
export function replace(path: string): void {
  if (typeof window === 'undefined') return;
  window.history.replaceState({ nav: Date.now() }, '', path);
  emit();
}

/** Go back one history entry (popstate notifies subscribers). */
export function back(): void {
  if (typeof window === 'undefined') return;
  window.history.back();
}

/**
 * Legacy hash deep-link parser (admin migration fallback):
 * `#tab=rooms` / `#/tab=rooms` → `'rooms'`; anything else → null.
 */
export function parseHashTab(hash?: string): string | null {
  const raw = hash ?? (typeof window === 'undefined' ? '' : window.location.hash ?? '');
  const match = /^[#/\s]*tab=([^&]+)/.exec(raw.trim());
  return match ? decodeURIComponent(match[1]) : null;
}

/** Subscribe to every navigation change (push/replace/back). Returns unsubscribe. */
export function onNavigation(listener: NavigationListener): () => void {
  install();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
