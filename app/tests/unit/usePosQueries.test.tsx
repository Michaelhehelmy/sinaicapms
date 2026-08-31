import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDeleteTableMutation, posKeys } from '@/hooks/usePosQueries';

vi.mock('@/lib/api', () => ({
  posGetDashboard: vi.fn().mockResolvedValue({}),
  posGetProducts: vi.fn().mockResolvedValue([]),
  posGetOrders: vi.fn().mockResolvedValue([]),
  posGetTables: vi.fn().mockResolvedValue([]),
  posGetActiveShift: vi.fn().mockResolvedValue(null),
  deletePosTable: vi.fn().mockResolvedValue({ success: true }),
}));

import * as apiClient from '@/lib/api';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, queryClient };
}

describe('useDeleteTableMutation', () => {
  beforeEach(() => {
    vi.mocked(apiClient.deletePosTable).mockClear();
  });

  it('deletes a table and invalidates tables + orders queries', async () => {
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteTableMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 't1' });
    });
    expect(apiClient.deletePosTable).toHaveBeenCalledWith('t1');
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: posKeys.tables() })
    );
  });
});
