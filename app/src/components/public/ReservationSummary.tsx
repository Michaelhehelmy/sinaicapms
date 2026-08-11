import { useState, useEffect, useCallback } from 'react';
import { escHtml, readableTextOn } from '@/lib/utils';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';

interface ReservationItem {
  roomType: { id: string; name: string; capacity: number; basePrice: number };
  guests: number;
  checkIn: string;
  checkOut: string;
  nights: number;
  price: number;
}

interface Props {
  tenantId: string;
  tenantName: string;
  primaryColor: string;
  whatsappNumber: string;
  currency?: string;
  /**
   * Backend API base (with `/api` suffix) used to capture the booking as a
   * lead server-side. When omitted the WhatsApp handoff still works — the
   * lead is best-effort and never blocks the handoff.
   */
  apiBase?: string;
  /**
   * "Back to Camp" target. Defaults to the marketplace deep link
   * `/camp/{tenantId}`; tenant-zone pages pass `/`.
   */
  campUrl?: string;
}

const STORAGE_KEY = 'sc_reservation';

/** Inline stroke icons - same family as the shared UI icons (20px, stroke-width 1.75). */
const TentIcon = ({ size = 20, className }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M12 4 3 19h18L12 4Z" />
    <path d="M12 4v15" />
    <path d="M7.5 12.5h9" />
  </svg>
);

const PhoneIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
  </svg>
);

const ClipboardIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
  </svg>
);

const T = {
  title: 'Your Reservation',
  subtitle: 'Review your booking details',
  empty: 'No rooms in your reservation.',
  emptyHint: 'Go back and add rooms to your reservation.',
  backToCamp: 'Back to Camp',
  guestInfo: 'Guest Information',
  nameLabel: 'Full Name *',
  namePlaceholder: 'Enter your full name',
  phoneLabel: 'Phone Number',
  phonePlaceholder: '+20 1XX XXX XXXX',
  checkIn: 'CHECK-IN',
  checkOut: 'CHECK-OUT',
  nights: 'NIGHTS',
  total: 'Total',
  room: 'room',
  guest: 'guest',
  sendWhatsApp: 'Send Booking via WhatsApp',
  copySummary: 'Copy Booking Summary',
  copied: 'Copied to clipboard!',
  remove: 'Remove',
  whatsappNotAvailable: 'WhatsApp not available - contact the camp directly',
  summaryTitle: 'Booking Summary',
  newBooking: 'New Booking at {name}',
  waTotal: 'Total',
} as const;

export default function ReservationSummaryPage(props: Props) {
  return (
    <ToastProvider>
      <ReservationSummaryInner {...props} />
    </ToastProvider>
  );
}

function ReservationSummaryInner({ tenantId, tenantName, primaryColor, whatsappNumber, currency = 'EGP', apiBase, campUrl }: Props) {
  const [items, setItems] = useState<ReservationItem[]>([]);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const { showToast } = useToast();

  const t = T;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setItems(raw ? JSON.parse(raw) : []);
    } catch { setItems([]); }
  }, []);

  // Readable foreground picked from WCAG luminance of the tenant primary color
  const headerFg = readableTextOn(primaryColor);
  const totalAmount = items.reduce((s, i) => s + i.price, 0);
  const totalGuests = items.reduce((s, i) => s + i.guests, 0);
  const formatPrice = (p: number) => `${p.toLocaleString()} ${currency}`;

  const removeItem = (idx: number) => {
    setItems(prev => {
      const next = prev.filter((_, i) => i !== idx);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const buildMessage = useCallback(() => {
    const lines = items.map((item, i) => {
      return `${i + 1}. ${escHtml(item.roomType.name)}\n   📅 ${item.checkIn} → ${item.checkOut}\n   ${item.guests} ${t.guest} | ${item.nights} nights\n   ${formatPrice(item.price)}`;
    });
    return `🏕️ ${t.newBooking.replace('{name}', escHtml(tenantName))}\n\n👤 ${escHtml(guestName)}${guestPhone ? ' - ' + escHtml(guestPhone) : ''}\n\n${lines.join('\n\n')}\n\n💰 ${t.waTotal}: ${formatPrice(totalAmount)}`;
  }, [items, guestName, guestPhone, t, tenantName, totalAmount]);

  // Best-effort server-side lead capture. The reservation previously lived
  // only in localStorage + the WhatsApp handoff, so the camp owner had no
  // record unless the guest actually messaged. Failure must never block the
  // WhatsApp handoff (hence .catch, fire-and-forget).
  const submitLead = useCallback(() => {
    if (!apiBase) return;
    const lines = items.map((item, i) => {
      return `${i + 1}. ${item.roomType.name} — ${item.checkIn} → ${item.checkOut} (${item.nights} nights, ${item.guests} guests) — ${formatPrice(item.price)}`;
    });
    const message = [
      `New booking request at ${tenantName}`,
      `Guest: ${guestName}${guestPhone ? ` / ${guestPhone}` : ''}`,
      '',
      ...lines,
      '',
      `${t.waTotal}: ${formatPrice(totalAmount)}`,
    ].join('\n');
    fetch(`${apiBase}/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: guestName,
        phone: guestPhone || undefined,
        subject: `Booking request — ${tenantName}`,
        message,
        source: 'booking',
      }),
    }).catch(() => {
      // Lead capture is best-effort — the WhatsApp handoff still works.
    });
  }, [apiBase, items, guestName, guestPhone, tenantName, totalAmount, t]);

  const sendWhatsApp = () => {
    if (!whatsappNumber || items.length === 0 || !guestName) return;
    const msg = buildMessage();
    window.open(`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
    submitLead();
  };

  const copySummary = () => {
    navigator.clipboard.writeText(buildMessage()).then(() => showToast(t.copied, 'success'));
  };

  return (
    <div className="min-h-screen pb-32 bg-warm-50">
      {/* Header */}
      <div className="relative overflow-hidden" style={{ background: primaryColor, color: headerFg }}>
        <div className="bg-topo pointer-events-none absolute inset-0 text-white opacity-20" aria-hidden="true"></div>
        <div className="relative max-w-2xl mx-auto px-5 py-7 text-center sm:py-10">
          <p className="mb-2 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.25em] opacity-80">
            <span className="inline-block h-px w-8 bg-current opacity-50" aria-hidden="true"></span>
            Camp Booking
            <span className="inline-block h-px w-8 bg-current opacity-50" aria-hidden="true"></span>
          </p>
          <h1 className="text-3xl font-black mb-1">{t.title}</h1>
          <p className="text-sm opacity-70">{t.subtitle}</p>
        </div>
        <div className="absolute -bottom-6 inset-x-0 h-6 bg-warm-50 rounded-t-3xl" />
      </div>

      <div className="max-w-2xl mx-auto px-5 pt-4">
        {items.length === 0 ? (
          <EmptyState
            icon={<TentIcon size={48} className="opacity-40" />}
            title={t.empty}
            description={t.emptyHint}
            action={{
              label: t.backToCamp,
              onClick: () => { window.location.href = campUrl || `/camp/${tenantId}`; },
            }}
            className="py-20"
          />
        ) : (
          <>
            {/* Date Overview */}
            {items.length > 0 && (
              <Card className="mb-4 !rounded-2xl !shadow-xs !border !border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-center">
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wide">{t.checkIn}</p>
                    <p className="font-bold text-sm mt-0.5">{items[0].checkIn}</p>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-gray-300 text-lg">→</span>
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ background: `${primaryColor}15`, color: primaryColor }}
                    >
                      {items[0].nights} {t.nights}
                    </span>
                  </div>
                  <div className="flex-1 text-center">
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wide">{t.checkOut}</p>
                    <p className="font-bold text-sm mt-0.5">{items[0].checkOut}</p>
                  </div>
                </div>
              </Card>
            )}

            {/* Room Cards */}
            <div className="space-y-3 mb-4">
              {items.map((item, idx) => (
                <Card key={idx} padding="sm" hover className="!rounded-2xl !shadow-xs !border !border-gray-100">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-base">{item.roomType.name}</h4>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-500">
                        <span>{item.guests} {t.guest}</span>
                        <span>{item.nights} nights</span>
                        <span>{item.checkIn} → {item.checkOut}</span>
                      </div>
                      <p className="font-bold text-base mt-2" style={{ color: primaryColor }}>
                        {formatPrice(item.price)}
                      </p>
                    </div>
                    <Button
                      onClick={() => removeItem(idx)}
                      variant="ghost"
                      size="sm"
                      className="!px-3 !py-1.5 !text-xs !text-red-400 !bg-red-50 hover:!bg-red-100 shrink-0"
                    >
                      {t.remove}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            {/* Guest Info */}
            <Card className="mb-4 !rounded-2xl !shadow-xs !border !border-gray-100">
              <h3 className="font-bold text-sm mb-4 text-gray-700">{t.guestInfo}</h3>
              <div className="space-y-3">
                <Input
                  label={t.nameLabel}
                  type="text"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder={t.namePlaceholder}
                  className="!rounded-xl !px-4 !py-3"
                />
                <Input
                  label={t.phoneLabel}
                  type="tel"
                  value={guestPhone}
                  onChange={e => setGuestPhone(e.target.value)}
                  placeholder={t.phonePlaceholder}
                  className="!rounded-xl !px-4 !py-3"
                />
              </div>
            </Card>

            {/* Total */}
            <Card className="mb-4 !rounded-2xl !shadow-xs !border !border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-500">{items.length} {t.room} · {totalGuests} {t.guest}</p>
                    <Badge variant="info" size="sm">{items.length}</Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{items[0].checkIn} → {items[0].checkOut}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 uppercase font-bold">{t.total}</p>
                  <p className="text-2xl font-black" style={{ color: primaryColor }}>{formatPrice(totalAmount)}</p>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>

      {/* Sticky Bottom Actions */}
      {items.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur-lg border-t border-gray-100 px-4 py-3 sm:px-5 sm:py-4">
          <div className="max-w-2xl mx-auto space-y-2">
            <Button
              onClick={sendWhatsApp}
              disabled={!whatsappNumber || !guestName}
              fullWidth
              leftIcon={<PhoneIcon />}
              className="!rounded-xl !min-h-[48px] !py-3 !text-sm sm:!text-base hover:!opacity-90 active:!scale-[0.98]"
              style={{ background: '#25D366' }}
            >
              {t.sendWhatsApp}
            </Button>
            <div className="flex gap-2">
              <Button
                onClick={copySummary}
                variant="secondary"
                fullWidth
                leftIcon={<ClipboardIcon />}
                className="!rounded-xl !min-h-[44px] !py-2.5 !text-xs sm:!text-sm"
              >
                {t.copySummary}
              </Button>
              <a href={campUrl || `/camp/${tenantId}`}
                className="flex-1 min-h-[44px] py-2.5 rounded-xl font-semibold text-xs sm:text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors text-center flex items-center justify-center">
                ← {t.backToCamp}
              </a>
            </div>
            {!whatsappNumber && (
              <p className="text-xs text-center text-gray-500">{t.whatsappNotAvailable}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
