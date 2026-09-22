/**
 * Ghost service-worker cleanup.
 *
 * The app ships zero service workers (PWA/offline is planned, not shipped —
 * see POLISH_PLAN §3.10). Any registration present in a visitor's browser is
 * therefore stale or foreign (e.g. a leftover experiment) and its fetch
 * handler can break lazy-loaded chunks with "intercepted … unexpected error".
 * This removes all registrations. Delete this module (and its call sites)
 * when PWA/offline ships.
 */

export interface GhostSWRegistration {
  unregister(): unknown;
}

export interface GhostSWNavigator {
  serviceWorker?: {
    getRegistrations(): Promise<GhostSWRegistration[]>;
  };
}

function defaultNavigator(): GhostSWNavigator | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator as unknown as GhostSWNavigator;
}

/** Unregister every service worker. Never throws (SSR-safe, API-safe). */
export function unregisterGhostServiceWorkers(
  nav: GhostSWNavigator | undefined = defaultNavigator(),
): void {
  try {
    if (!nav || !nav.serviceWorker || typeof nav.serviceWorker.getRegistrations !== 'function') {
      return;
    }
    nav.serviceWorker
      .getRegistrations()
      .then((regs) => {
        (regs || []).forEach((r) => {
          try {
            r.unregister();
          } catch {
            /* per-registration failure must not block the rest */
          }
        });
      })
      .catch(() => {});
  } catch {
    /* cleanup must never break page boot */
  }
}
