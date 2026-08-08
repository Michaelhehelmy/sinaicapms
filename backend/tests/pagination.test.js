import { describe, it, expect } from 'vitest';
import { parsePagination, paginationEnvelope } from '../src/utils/pagination.js';

function urlFor(qs = '') {
  return new URL(`https://x.com/api/orders${qs}`);
}

describe('parsePagination', () => {
  it('returns defaults when no params', () => {
    const { page, pageSize, offset } = parsePagination(urlFor());
    expect(page).toBe(1);
    expect(pageSize).toBe(50);
    expect(offset).toBe(0);
  });

  it('parses explicit page/pageSize and derives offset', () => {
    const { page, pageSize, offset } = parsePagination(urlFor('?page=3&pageSize=10'));
    expect(page).toBe(3);
    expect(pageSize).toBe(10);
    expect(offset).toBe(20);
  });

  it('clamps pageSize to max 200', () => {
    const { pageSize } = parsePagination(urlFor('?pageSize=999'));
    expect(pageSize).toBe(200);
  });

  it('clamps pageSize to min 1', () => {
    const { pageSize } = parsePagination(urlFor('?pageSize=0'));
    expect(pageSize).toBe(1);
  });

  it('clamps page to min 1', () => {
    const { page, offset } = parsePagination(urlFor('?page=0'));
    expect(page).toBe(1);
    expect(offset).toBe(0);
  });

  it('falls back to defaults for non-numeric values', () => {
    const { page, pageSize } = parsePagination(urlFor('?page=abc&pageSize=xyz'));
    expect(page).toBe(1);
    expect(pageSize).toBe(50);
  });

  it('supports custom defaultPageSize', () => {
    const { pageSize } = parsePagination(urlFor(), { defaultPageSize: 25 });
    expect(pageSize).toBe(25);
  });

  it('supports custom maxPageSize', () => {
    const { pageSize } = parsePagination(urlFor('?pageSize=500'), { maxPageSize: 100 });
    expect(pageSize).toBe(100);
  });
});

describe('paginationEnvelope', () => {
  it('builds the 5-key wire envelope', () => {
    const envelope = paginationEnvelope([{ id: 1 }], 1, 1, 50);
    expect(envelope).toEqual({
      data: [{ id: 1 }],
      total: 1,
      page: 1,
      pageSize: 50,
      hasMore: false,
    });
  });

  it('sets hasMore true when another page exists', () => {
    expect(paginationEnvelope([], 55, 1, 50).hasMore).toBe(true);
    expect(paginationEnvelope([], 50, 1, 50).hasMore).toBe(false);
    // page 2 * pageSize 25 = 50 rows covered; total 50 means no more pages
    expect(paginationEnvelope([], 50, 2, 25).hasMore).toBe(false);
    expect(paginationEnvelope([], 51, 2, 25).hasMore).toBe(true);
  });
});
