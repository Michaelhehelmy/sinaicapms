/**
 * StorefrontConfirmation — order confirmation page.
 *
 * client:visible island. Fetches orders via a session and displays the order
 * matching orderNumber, plus a WhatsApp link when the order is pending.
 *
 * Phase 5 step 5d — the confirmation groups line items by project: each line
 * carries its own project (stamped server-side from cart → order lines in
 * 5a/5c), the group label comes from the public project directory
 * (GET /api/marketplace/:tenantSlug → project name + type — the guest never
 * sees a raw project/product id), and exactly ONE grand total renders.
 * Lines with no (or an unresolvable) project fall into a single trailing
 * Legacy bucket rendered as a flat ungrouped list. Line items reach this
 * page via a sessionStorage snapshot written at checkout time
 * (saveConfirmationSnapshot — the server empties the cart in the same batch
 * that creates the order, and GET /storefront/orders is header-only, so the
 * pre-checkout cart is the only frontend-readable line source; no backend
 * change was required).
 */
import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStorefrontOrders, getStorefrontProducts, apiFetch } from '@/lib/api';
import { getSessionId } from '@/lib/storefrontSession';
import { formatCurrency } from '@/lib/utils';

type Order = { id: string; orderNumber: string; totalAmount: number; status: string; createdAt?: string };

// ── Confirmation line grouping (5d, pure — unit-tested) ─────────────────────

/** One order line as captured in the checkout-time snapshot. */
export interface ConfirmationLine {
  id: string;
  productId?: string;
  productName?: string;
  quantity: number;
  unitPrice?: number;
  totalPrice: number;
  projectId?: string | null;
}

/** One project row from the public directory (id → human label). */
export interface ConfirmationProject {
  id: string;
  name: string;
  projectType?: string | null;
}

/** One rendered group: a project section, or the trailing Legacy bucket. */
export interface ProjectGroup {
  key: string;
  title: string;
  subtitle?: string;
  legacy: boolean;
  lines: ConfirmationLine[];
}

export const LEGACY_GROUP_TITLE = 'Legacy';
export const LEGACY_GROUP_SUBTITLE = 'Unassigned items from earlier orders';

/** sessionStorage key holding the checkout-time line snapshot for an order. */
export function confirmationSnapshotKey(orderNumber: string): string {
  return `sc_confirmation_${orderNumber}`;
}

/**
 * Persist the pre-checkout cart lines for later rendering on the
 * confirmation page. Best-effort display state — never throws.
 */
export function saveConfirmationSnapshot(orderNumber: string, lines: ConfirmationLine[]): void {
  try {
    if (typeof window === 'undefined' || !orderNumber) return;
    window.sessionStorage.setItem(confirmationSnapshotKey(orderNumber), JSON.stringify({ lines }));
  } catch {
    // Snapshot is display-only; checkout must never fail because of it.
  }
}

/** Read the checkout-time snapshot back. Null when absent or malformed. */
export function readConfirmationSnapshot(orderNumber: string): ConfirmationLine[] | null {
  try {
    if (typeof window === 'undefined' || !orderNumber) return null;
    const raw = window.sessionStorage.getItem(confirmationSnapshotKey(orderNumber));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lines?: unknown };
    if (!parsed || !Array.isArray(parsed.lines)) return null;
    const lines = (parsed.lines as Array<Record<string, unknown>>).filter(
      (l) => l && typeof l.id === 'string' && typeof l.totalPrice === 'number' && typeof l.quantity === 'number',
    );
    return lines as unknown as ConfirmationLine[];
  } catch {
    return null;
  }
}

/**
 * Group snapshot lines by project. Tagged lines whose project resolves in
 * the directory form one section per project (first-seen order); lines with
 * no tag — or a tag the directory does not know (legacy orders predate 5c) —
 * fall into a single trailing Legacy bucket rendered as a flat list.
 */
export function groupLinesByProject(
  lines: ConfirmationLine[],
  projects: ConfirmationProject[],
): ProjectGroup[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const groups: ProjectGroup[] = [];
  const indexByKey = new Map<string, ProjectGroup>();
  let legacy: ProjectGroup | null = null;
  for (const line of lines) {
    const pid = line.projectId ?? null;
    const proj = pid ? byId.get(pid) : undefined;
    if (proj && pid) {
      let g = indexByKey.get(pid);
      if (!g) {
        g = {
          key: pid,
          title: proj.name,
          subtitle: proj.projectType ?? undefined,
          legacy: false,
          lines: [],
        };
        indexByKey.set(pid, g);
        groups.push(g);
      }
      g.lines.push(line);
    } else {
      if (!legacy) {
        legacy = {
          key: 'legacy',
          title: LEGACY_GROUP_TITLE,
          subtitle: LEGACY_GROUP_SUBTITLE,
          legacy: true,
          lines: [],
        };
      }
      legacy.lines.push(line);
    }
  }
  if (legacy) groups.push(legacy);
  return groups;
}

/**
 * Human label for a line. The snapshot carries no product names (cart_items
 * has no name column), so names resolve via the public catalog; anything
 * unresolvable renders a generic label — raw product ids never reach guests.
 */
export function resolveConfirmationLineName(
  line: ConfirmationLine,
  namesByProductId: Map<string, string> | Record<string, string>,
): string {
  if (line.productName) return line.productName;
  const pid = line.productId ?? '';
  const name = namesByProductId instanceof Map ? namesByProductId.get(pid) : namesByProductId[pid];
  return name || 'Item';
}

interface Props {
  orderNumber: string;
  tenantId: string;
  primaryColor: string;
  tenantName: string;
}

export default function StorefrontConfirmation({ orderNumber, tenantId, primaryColor, tenantName }: Props) {
  const sessionId = getSessionId(tenantId);
  const [order, setOrder] = useState<Order | null>(null);
  const [notFound, setNotFound] = useState(false);

  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ['storefront-orders', sessionId],
    queryFn: () => getStorefrontOrders(sessionId) as Promise<Order[]>,
    enabled: !!sessionId,
    // never refetch — the order is created before this page loads
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!orders) return;
    const match = orders.find((o) => o.orderNumber === orderNumber || o.id === orderNumber);
    if (match) setOrder(match);
    else setNotFound(true);
  }, [orders, orderNumber]);

  // 5d: checkout-time line snapshot (the only frontend-readable line source —
  // the server empties the cart when the order is created). Static per order.
  const snapshot = useMemo(() => readConfirmationSnapshot(orderNumber), [orderNumber]);
  const hasSnapshotLines = !!snapshot && snapshot.length > 0;

  // 5d: public project directory → id-to-label map for group headings.
  // Public endpoint (no auth); tenant id works as the slug-or-id lookup.
  // Fail-soft: unknown tags fall into the Legacy bucket, never raw ids.
  const { data: profile } = useQuery<{ projects?: Array<{ id: string; name: string; projectType?: string | null }> }>({
    queryKey: ['confirmation-projects', tenantId],
    queryFn: () => apiFetch<{ projects?: Array<{ id: string; name: string; projectType?: string | null }> }>(
      `/marketplace/${encodeURIComponent(tenantId)}`,
    ) as Promise<{ projects?: Array<{ id: string; name: string; projectType?: string | null }> }>,
    enabled: hasSnapshotLines && !!tenantId,
    staleTime: Infinity,
  });

  // 5d: public catalog → product id-to-name map (cart lines carry no names).
  // Paginated (100 max); orders larger than one page keep a generic label.
  const { data: catalog } = useQuery<{ data?: Array<{ id: string; name: string }> }>({
    queryKey: ['confirmation-products'],
    queryFn: () => getStorefrontProducts({ pageSize: 100 }) as Promise<{ data?: Array<{ id: string; name: string }> }>,
    enabled: hasSnapshotLines,
    staleTime: Infinity,
  });

  const projects = useMemo<ConfirmationProject[]>(
    () => (Array.isArray(profile?.projects) ? profile.projects.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string') : []),
    [profile],
  );
  const namesByProductId = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const p of catalog?.data ?? []) {
      if (p && typeof p.id === 'string' && typeof p.name === 'string') map.set(p.id, p.name);
    }
    return map;
  }, [catalog]);
  const groups = useMemo<ProjectGroup[]>(
    () => (hasSnapshotLines ? groupLinesByProject(snapshot ?? [], projects) : []),
    // snapshot is static per orderNumber; projects resolve labels async.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasSnapshotLines, orderNumber, projects],
  );
  // Exactly ONE grand total on the page: the authoritative server figure when
  // the order has loaded, else the snapshot sum (identical by construction).
  const snapshotTotal = useMemo(
    () => (snapshot ?? []).reduce((s, l) => s + (l.totalPrice || 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orderNumber],
  );
  const grandTotal = order?.totalAmount ?? snapshotTotal;

  const isPending = !order || order.status === 'pending';
  const showWhatsapp = isPending && !!sessionId; // keep it simple: pending orders can be followed up

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-xl bg-stone-200" />;
  }

  if (notFound) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <h2 className="text-xl font-bold text-stone-800">Order not found</h2>
        <p className="mt-2 text-stone-500">We could not find this order on this device.</p>
        <a href="/storefront" className="mt-4 inline-block rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: primaryColor }}>
          Continue shopping
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-8 shadow-sm">
      {isPending ? (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-2xl">⏳</div>
          <h2 className="text-xl font-bold text-stone-800">Thank you! Your order is being processed.</h2>
          <p className="mt-2 text-stone-500">
            {tenantName} will confirm order <span className="font-semibold text-stone-700">#{order?.orderNumber}</span> shortly.
          </p>
        </div>
      ) : (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl">✅</div>
          <h2 className="text-xl font-bold text-stone-800">Order confirmed!</h2>
          <p className="mt-2 text-stone-500">
            Order <span className="font-semibold text-stone-700">#{order?.orderNumber}</span>
            {/* 5d: when grouped lines render, the single grand total lives in
                the lines section below — never twice on one page. */}
            {groups.length === 0 && <> · {formatCurrency(order?.totalAmount ?? 0)}</>}
          </p>
        </div>
      )}

      {/* 5d: lines grouped by project label, exactly one grand total. */}
      {groups.length > 0 && (
        <div className="mt-8 border-t border-stone-200 pt-6 text-left">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-stone-500">Order lines</h3>
          <div className="space-y-5">
            {groups.map((group) => (
              <section
                key={group.key}
                data-testid={group.legacy ? 'confirmation-legacy-group' : 'confirmation-group'}
                aria-label={group.title}
              >
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h4 data-testid="confirmation-group-title" className="font-bold text-stone-800">
                    {group.title}
                  </h4>
                  {group.subtitle && (
                    <span className="text-xs text-stone-400">{group.subtitle}</span>
                  )}
                </div>
                <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
                  {group.lines.map((line) => (
                    <li key={line.id} data-testid="confirmation-line" className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0 flex-1 truncate text-stone-700">
                        {resolveConfirmationLineName(line, namesByProductId)}
                        <span className="ml-2 text-xs text-stone-400">× {line.quantity}</span>
                      </span>
                      <span className="shrink-0 font-medium text-stone-800">{formatCurrency(line.totalPrice)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div data-testid="confirmation-total" className="mt-4 flex items-center justify-between border-t border-stone-200 pt-4">
            <span className="text-sm font-bold uppercase tracking-wider text-stone-500">Total</span>
            <span className="text-xl font-black text-stone-900">{formatCurrency(grandTotal)}</span>
          </div>
        </div>
      )}

      {showWhatsapp && (
        <p className="mt-6 text-center text-sm text-stone-500">
          Questions? Contact <span className="font-medium text-stone-600">{tenantName}</span> directly to speed things up.
        </p>
      )}

      <div className="mt-6 text-center">
        <a href="/storefront" className="inline-block rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90" style={{ backgroundColor: primaryColor }}>
          Continue shopping
        </a>
      </div>
    </div>
  );
}