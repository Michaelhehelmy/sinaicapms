import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMarketplaceListings, getMarketplaceCategories } from '@/lib/api';
import type { MarketplaceListing, MarketplaceCategory } from '@/lib/api';
import { escHtml, getLocationDisplay } from '@/lib/utils';

const PAGE_SIZE = 12;

/* ── Star rating helper ──────────────────────────────────────────── */
function StarRating({ rating, count }: { rating: number; count: number }) {
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <div className="flex gap-0.5" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <svg
            key={i}
            className={`h-4 w-4 ${i <= Math.round(rating) ? 'text-amber-400' : 'text-warm-300'}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      <span className="text-warm-500">
        {rating > 0 ? rating.toFixed(1) : '—'}
      </span>
      {count > 0 && (
        <span className="text-warm-400">({count})</span>
      )}
    </div>
  );
}

/* ── Skeleton card for loading state ─────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-warm-100 bg-white shadow-sm animate-pulse">
      <div className="h-24 bg-warm-100" />
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 h-4 w-3/4 rounded bg-warm-100" />
        <div className="mb-2 h-3 w-full rounded bg-warm-100" />
        <div className="mb-2 h-3 w-5/6 rounded bg-warm-100" />
        <div className="mb-4 h-3 w-1/2 rounded bg-warm-100" />
        <div className="mt-auto h-9 w-20 rounded-full bg-warm-100" />
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────── */
export default function MarketplaceDirectory() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [page, setPage] = useState(1);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    // Simple debounce via timeout
    const id = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 350);
    return () => clearTimeout(id);
  }, []);

  const { data: categories = [], isLoading: catLoading } = useQuery<MarketplaceCategory[]>({
    queryKey: ['marketplace-categories'],
    queryFn: getMarketplaceCategories,
    staleTime: 600_000,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['marketplace-listings', debouncedSearch, activeCategory, page],
    queryFn: () =>
      getMarketplaceListings({
        search: debouncedSearch || undefined,
        category: activeCategory || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    staleTime: 120_000,
  });

  const listings: MarketplaceListing[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const hasMore = data?.hasMore ?? false;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      {/* ── Page heading ─────────────────────────────────────── */}
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-[var(--text)] sm:text-4xl">
          Discover Camps
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-[var(--text-muted)]">
          Browse every registered camp on Sinai. Search by name, filter by category, and find the perfect adventure.
        </p>
      </div>

      {/* ── Search bar ───────────────────────────────────────── */}
      <div className="mx-auto mb-6 max-w-2xl">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-warm-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by name, description, location..."
            className="w-full rounded-xl border border-warm-200 bg-white py-3 pl-10 pr-4 text-sm text-[var(--text)] placeholder:text-warm-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            aria-label="Search camps"
          />
        </div>
      </div>

      {/* ── Category pills ───────────────────────────────────── */}
      {!catLoading && categories.length > 0 && (
        <div className="mx-auto mb-8 max-w-3xl overflow-x-auto pb-2">
          <div className="flex gap-2 justify-center flex-wrap">
            <button
              onClick={() => { setActiveCategory(''); setPage(1); }}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                activeCategory === ''
                  ? 'bg-brand text-white shadow-sm'
                  : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => { setActiveCategory(cat.slug); setPage(1); }}
                className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  activeCategory === cat.slug
                    ? 'bg-brand text-white shadow-sm'
                    : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
                }`}
              >
                {escHtml(cat.name)}
                {cat.projectCount > 0 && (
                  <span className="ml-1 opacity-70">({cat.projectCount})</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Results count ────────────────────────────────────── */}
      {!isLoading && (
        <p className="mb-6 text-center text-sm text-warm-500">
          {total === 0 ? 'No camps found' : `Showing ${listings.length} of ${total} camp${total !== 1 ? 's' : ''}`}
        </p>
      )}

      {/* ── Loading state ────────────────────────────────────── */}
      {isLoading && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* ── Error state ──────────────────────────────────────── */}
      {isError && (
        <div className="rounded-2xl border border-warm-100 bg-white px-6 py-16 text-center shadow-sm">
          <p className="font-display text-lg font-bold text-[var(--text)]">Could not load camps</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-warm-500">
            We hit a snag while fetching the latest listings. Please try again.
          </p>
          <button
            onClick={() => refetch()}
            className="mt-4 rounded-full bg-brand px-5 py-2 text-sm font-bold text-white transition hover:opacity-90"
          >
            Try Again
          </button>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────── */}
      {!isLoading && !isError && listings.length === 0 && (
        <div className="rounded-2xl border border-warm-100 bg-white px-6 py-16 text-center shadow-sm">
          <svg className="mx-auto mb-4 h-12 w-12 text-warm-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <p className="font-display text-lg font-bold text-[var(--text)]">No camps match your search</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-warm-500">
            Try adjusting your filters or search terms.
          </p>
        </div>
      )}

      {/* ── Listings grid ────────────────────────────────────── */}
      {!isLoading && !isError && listings.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => {
            const color = listing.primaryColor || '#4a7c4f';
            const detailUrl = listing.subdomain
              ? `https://${listing.subdomain}.sinaicamps.com`
              : `/camp/${listing.tenantId}`;

            return (
              <div
                key={listing.tenantId}
                className="group flex flex-col overflow-hidden rounded-2xl border border-warm-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
              >
                {/* Color band */}
                <div
                  className="relative h-20 overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)` }}
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-topo opacity-40"
                    style={{ color }}
                  />
                </div>

                <div className="flex flex-1 flex-col p-5">
                  {/* Logo / initial */}
                  <div className="-mt-10 mb-3">
                    <div
                      className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white shadow-md ring-4 ring-white"
                      style={{ backgroundColor: color }}
                    >
                      {escHtml(listing.tenantName.charAt(0).toUpperCase())}
                    </div>
                  </div>

                  {/* Name & slug */}
                  <h3 className="mb-1 text-lg font-extrabold text-gray-900 line-clamp-1">
                    {escHtml(listing.tenantName)}
                  </h3>
                  <span className="mb-2 text-xs text-warm-500">
                    {escHtml(listing.subdomain)}.sinaicamps.com
                  </span>

                  {/* Description */}
                  <p className="mb-3 flex-1 text-sm leading-relaxed text-warm-600 line-clamp-3">
                    {escHtml(
                      listing.projectDescription ||
                        listing.tenantDescription ||
                        'Premium summer adventure programs, cabins lodging, and outdoor wilderness courses.'
                    )}
                  </p>

                  {/* Location */}
                  {listing.location && (
                    <div className="mb-3 flex items-center gap-1.5 text-sm text-warm-500">
                      <svg className="h-4 w-4 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      <span className="truncate">{escHtml(getLocationDisplay(listing.location))}</span>
                    </div>
                  )}

                  {/* Rating */}
                  <StarRating rating={listing.avgRating} count={listing.reviewCount} />

                  {/* Capacity badge */}
                  {listing.capacity != null && listing.capacity > 0 && (
                    <div className="mt-3">
                      <span
                        className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold"
                        style={{ backgroundColor: `${color}15`, color }}
                      >
                        Up to {listing.capacity} guests
                      </span>
                    </div>
                  )}

                  {/* CTA */}
                  <div className="mt-4 border-t border-warm-100 pt-4">
                    <a
                      href={detailUrl}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-bold text-white transition hover:opacity-90"
                      style={{ backgroundColor: color }}
                    >
                      View Camp
                      <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5">
                        →
                      </span>
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ───────────────────────────────────────── */}
      {totalPages > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Pagination">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-full border border-warm-200 bg-white px-4 py-2 text-sm font-semibold text-warm-600 transition hover:bg-warm-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
            .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
              if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
              acc.push(p);
              return acc;
            }, [])
            .map((item, idx) =>
              item === 'ellipsis' ? (
                <span key={`e-${idx}`} className="px-2 text-warm-400">…</span>
              ) : (
                <button
                  key={item}
                  onClick={() => setPage(item)}
                  className={`h-9 w-9 rounded-full text-sm font-semibold transition ${
                    page === item
                      ? 'bg-brand text-white shadow-sm'
                      : 'border border-warm-200 bg-white text-warm-600 hover:bg-warm-50'
                  }`}
                >
                  {item}
                </button>
              )
            )}

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={!hasMore}
            className="rounded-full border border-warm-200 bg-white px-4 py-2 text-sm font-semibold text-warm-600 transition hover:bg-warm-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
