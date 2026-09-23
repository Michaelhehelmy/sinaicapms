import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getMeals,
  getMealCategories,
  saveMeal,
  saveMealCategory,
  bulkCreateMeals,
  createMealSchedule,
} from '@/lib/api';

// P2-C frontend: additive `projectId` contract on the meal API surface.
// Backend ?projectId support lands in parallel (P2-B) — these tests pin the
// *frontend* half of the recon contract (param name `projectId`, omission =
// tenant-wide) against mocked fetch and never invent backend behavior.

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function okJson(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}

function lastUrl(): string {
  return String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0]);
}

function lastBody(): Record<string, unknown> {
  const init = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1] as {
    body?: string;
  };
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  fetchMock.mockResolvedValue(okJson([]));
});

describe('getMeals project scope (additive)', () => {
  it('calls the bare tenant-wide endpoint when no project is given (legacy)', async () => {
    fetchMock.mockResolvedValueOnce(okJson([]));
    await getMeals();
    expect(lastUrl()).toMatch(/\/meals$/);
    expect(lastUrl()).not.toContain('projectId');
  });

  it('narrows with ?projectId when a project is given (recon contract)', async () => {
    fetchMock.mockResolvedValueOnce(okJson([]));
    await getMeals({ projectId: 'p1' });
    expect(lastUrl()).toContain('/meals?projectId=p1');
  });

  it('URL-encodes the project id', async () => {
    fetchMock.mockResolvedValueOnce(okJson([]));
    await getMeals({ projectId: 'p 1&x=2' });
    expect(lastUrl()).toContain('/meals?projectId=p%201%26x%3D2');
  });
});

describe('getMealCategories project scope (additive)', () => {
  it('calls the bare tenant-wide endpoint when no project is given (legacy)', async () => {
    fetchMock.mockResolvedValueOnce(okJson([]));
    await getMealCategories();
    expect(lastUrl()).toMatch(/\/meal-categories$/);
    expect(lastUrl()).not.toContain('projectId');
  });

  it('narrows with ?projectId when a project is given', async () => {
    fetchMock.mockResolvedValueOnce(okJson([]));
    await getMealCategories({ projectId: 'p9' });
    expect(lastUrl()).toContain('/meal-categories?projectId=p9');
  });
});

describe('meal writes carry projectId (additive, camelCase wire)', () => {
  it('saveMeal POST body includes projectId on create', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ id: 'm1', success: true }));
    await saveMeal({ name: 'Koshary', price: 50, projectId: 'p1' });
    const init = fetchMock.mock.calls[0][1] as { method?: string };
    expect(init.method).toBe('POST');
    expect(lastBody()).toMatchObject({ name: 'Koshary', projectId: 'p1' });
  });

  it('saveMeal without projectId sends the legacy body unchanged', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ id: 'm1', success: true }));
    await saveMeal({ name: 'Koshary', price: 50 });
    expect(lastBody()).not.toHaveProperty('projectId');
  });

  it('saveMeal PUT keeps the legacy path + method for edits', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ success: true }));
    await saveMeal({ name: 'New' }, 'm1');
    const init = fetchMock.mock.calls[0][1] as { method?: string };
    expect(init.method).toBe('PUT');
    expect(lastUrl()).toContain('/meals/m1');
  });

  it('saveMealCategory POST body includes projectId on create', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ id: 'c1', success: true }));
    await saveMealCategory({ name: 'Mains', projectId: 'p1' });
    expect(lastBody()).toMatchObject({ name: 'Mains', projectId: 'p1' });
  });

  it('bulkCreateMeals without a project sends items untouched (legacy)', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ ids: ['m1'], count: 1, success: true }));
    await bulkCreateMeals([{ name: 'A', price: 10 }]);
    expect(lastBody()).toEqual({ items: [{ name: 'A', price: 10 }] });
  });

  it('bulkCreateMeals tags every untagged item; per-item projectId wins', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ ids: ['m1', 'm2'], count: 2, success: true }));
    await bulkCreateMeals(
      [
        { name: 'A', price: 10 },
        { name: 'B', price: 20, projectId: 'p-other' },
      ],
      'p1',
    );
    expect(lastBody()).toEqual({
      items: [
        { name: 'A', price: 10, projectId: 'p1' },
        { name: 'B', price: 20, projectId: 'p-other' },
      ],
    });
  });

  it('createMealSchedule keeps campId and adds projectId', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ id: 's1' }));
    await createMealSchedule({
      campId: 'p1',
      projectId: 'p1',
      date: '2026-09-24',
      mealId: 'm1',
    });
    expect(lastBody()).toMatchObject({ campId: 'p1', projectId: 'p1', mealId: 'm1' });
  });

  it('createMealSchedule without projectId sends the legacy body unchanged', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ id: 's1' }));
    await createMealSchedule({ campId: 'c1', date: '2026-09-24', mealId: 'm1' });
    expect(lastBody()).not.toHaveProperty('projectId');
  });
});
