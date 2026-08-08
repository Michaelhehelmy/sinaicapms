/**
 * T6 — Shared pagination helpers.
 *
 * Wire contract on list endpoints: { data, total, page, pageSize, hasMore }
 *   - `data`     : the page's rows (already camelCase via the response choke point).
 *   - `total`    : total row count for the CURRENT filter (not just the page).
 *   - `page`     : 1-based page number that was served.
 *   - `pageSize` : page size that was served (clamped to [1, maxPageSize]).
 *   - `hasMore`  : `page * pageSize < total` — true when another page exists.
 *
 * Query params: `page` (default 1) and `pageSize` (default 50, max 200).
 * This is the clean migration from the old `limit`/`offset` params.
 */

/**
 * Parse `page`/`pageSize` from a URL and derive the SQL OFFSET.
 * @param {URL} url
 * @param {{ defaultPageSize?: number, maxPageSize?: number }} [opts]
 * @returns {{ page: number, pageSize: number, offset: number }}
 */
export function parsePagination(url, opts = {}) {
  const { defaultPageSize = 50, maxPageSize = 200 } = opts;
  const rawPage = parseInt(url.searchParams.get('page') || '1', 10);
  const rawPageSize = parseInt(url.searchParams.get('pageSize') || String(defaultPageSize), 10);

  const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.min(Math.max(1, Math.floor(rawPageSize)), maxPageSize)
    : defaultPageSize;
  const offset = (page - 1) * pageSize;

  return { page, pageSize, offset };
}

/**
 * Build the paginated response envelope.
 * @param {Array} data
 * @param {number} total
 * @param {number} page
 * @param {number} pageSize
 * @returns {{ data: Array, total: number, page: number, pageSize: number, hasMore: boolean }}
 */
export function paginationEnvelope(data, total, page, pageSize) {
  return {
    data,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };
}
