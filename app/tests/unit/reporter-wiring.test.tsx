import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useCampsQuery } from '@/hooks/useQueryHooks';

// The shared TanStack choke point (`useErrorToast`) must forward every query
// failure to the monitor reporter — mock the reporter and fail one query.
const mockReportError = vi.fn();
vi.mock('@/lib/reporter', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

const mockShowToast = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockGetCamps = vi.fn();
vi.mock('@/lib/api', () => ({
  getCamps: (...args: unknown[]) => mockGetCamps(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return wrapper;
}

describe('reporter wiring — TanStack global onError', () => {
  beforeEach(() => {
    mockReportError.mockClear();
    mockShowToast.mockClear();
    mockGetCamps.mockReset();
  });

  it('forwards a failed admin query to reportError via the shared hook', async () => {
    mockGetCamps.mockRejectedValue(new Error('Camp boom'));
    const { result } = renderHook(() => useCampsQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockReportError).toHaveBeenCalledWith('Failed to load camps: Camp boom');
  });

  it('does not report successful queries', async () => {
    mockGetCamps.mockResolvedValue([{ id: '1', name: 'Test Camp' }]);
    const { result } = renderHook(() => useCampsQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockReportError).not.toHaveBeenCalled();
  });
});

describe('reporter wiring — layout window.onerror presence', () => {
  const layouts = [
    'src/layouts/PublicLayout.astro',
    'src/layouts/AdminLayout.astro',
    'src/layouts/POSLayout.astro',
  ];

  it.each(layouts)('%s installs initErrorReporting', (layout) => {
    const src = readFileSync(join(process.cwd(), layout), 'utf8');
    expect(src).toContain(`from '@/lib/reporter'`);
    expect(src).toContain('initErrorReporting()');
  });
});

describe('reporter wiring — feedback widget presence', () => {
  it('DebugFeedbackWidget forwards a monitor copy via reportFeedback', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/debug/DebugFeedbackWidget.tsx'), 'utf8');
    expect(src).toContain(`import('@/lib/reporter')`);
    expect(src).toContain('reportFeedback(');
  });

  it('the shared query hook forwards via reportError (no per-panel forks)', () => {
    const src = readFileSync(join(process.cwd(), 'src/hooks/useQueryHooks.ts'), 'utf8');
    expect(src).toContain(`from '@/lib/reporter'`);
    expect(src).toContain('reportError(');
  });
});
