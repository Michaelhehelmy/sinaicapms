import { describe, it, expect, vi } from 'vitest';
import { unregisterGhostServiceWorkers } from '@/lib/sw-cleanup';

describe('unregisterGhostServiceWorkers', () => {
  it('calls getRegistrations when navigator.serviceWorker exists', async () => {
    const getRegistrations = vi.fn(async () => []);
    unregisterGhostServiceWorkers({ serviceWorker: { getRegistrations } });
    await Promise.resolve();
    expect(getRegistrations).toHaveBeenCalledTimes(1);
  });

  it('calls unregister on each returned registration', async () => {
    const unregisterA = vi.fn();
    const unregisterB = vi.fn();
    unregisterGhostServiceWorkers({
      serviceWorker: { getRegistrations: async () => [{ unregister: unregisterA }, { unregister: unregisterB }] },
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(unregisterA).toHaveBeenCalledTimes(1);
    expect(unregisterB).toHaveBeenCalledTimes(1);
  });

  it('does not throw when navigator.serviceWorker is undefined', () => {
    expect(() => unregisterGhostServiceWorkers(undefined)).not.toThrow();
    expect(() => unregisterGhostServiceWorkers({})).not.toThrow();
    expect(() => unregisterGhostServiceWorkers({ serviceWorker: undefined })).not.toThrow();
  });
});
