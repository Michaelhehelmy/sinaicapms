import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFilterState } from '@/hooks/useFilterState';

const defaults = { status: 'all', search: '', page: '1' };

function withSearch(query: string) {
  window.history.replaceState({}, '', `/admin/super_tenants${query}`);
}

describe('useFilterState', () => {
  beforeEach(() => {
    withSearch('');
  });

  it('returns defaults when URL has no params', () => {
    const { result } = renderHook(() => useFilterState(defaults));
    expect(result.current.filters).toEqual({ status: 'all', search: '', page: '1' });
  });

  it('reads initial state from URL search params', () => {
    withSearch('?status=active&search=acacia&page=2');
    const { result } = renderHook(() => useFilterState(defaults));
    expect(result.current.filters).toEqual({ status: 'active', search: 'acacia', page: '2' });
  });

  it('falls back to defaults for keys missing from the URL', () => {
    withSearch('?status=active');
    const { result } = renderHook(() => useFilterState(defaults));
    expect(result.current.filters).toEqual({ status: 'active', search: '', page: '1' });
  });

  it('setFilter updates state and persists to the URL', () => {
    const { result } = renderHook(() => useFilterState(defaults));
    act(() => {
      result.current.setFilter('status', 'active');
    });
    expect(result.current.filters.status).toBe('active');
    expect(window.location.search).toContain('status=active');
  });

  it('setFilter removes a key from the URL when set back to its default', () => {
    withSearch('?status=active');
    const { result } = renderHook(() => useFilterState(defaults));
    act(() => {
      result.current.setFilter('status', 'all'); // default value
    });
    expect(result.current.filters.status).toBe('all');
    expect(window.location.search).not.toContain('status=active');
  });

  it('resetFilters restores defaults and clears the URL', () => {
    withSearch('?status=active&search=foo&page=2');
    const { result } = renderHook(() => useFilterState(defaults));
    act(() => {
      result.current.resetFilters();
    });
    expect(result.current.filters).toEqual(defaults);
    expect(window.location.search).toBe('');
  });

  it('setPage persists page number to the URL', () => {
    const { result } = renderHook(() => useFilterState(defaults));
    act(() => {
      result.current.setPage(3);
    });
    expect(result.current.filters.page).toBe('3');
    expect(window.location.search).toContain('page=3');
  });

  it('re-syncs filters when an external navigation event fires', () => {
    const { result } = renderHook(() => useFilterState(defaults));
    act(() => {
      result.current.setFilter('status', 'active');
    });
    // Simulate an external URL change + popstate-style sync via push
    act(() => {
      window.history.pushState({}, '', '/admin/super_tenants?status=pending');
      // trigger the onNavigation listener by dispatching popstate
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    // The hook's load listener calls setFilters(readParams())
    expect(result.current.filters.status).toBe('pending');
  });
});
