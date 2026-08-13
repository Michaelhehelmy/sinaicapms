import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn, INK, readableTextOn, normalizeAssetUrl } from '@/lib/utils';

interface RoomType {
  id: string;
  name: string;
  description?: string;
  capacity: number;
  basePrice: number;
  imageUrl?: string;
}

interface ReservationItem {
  roomType: RoomType;
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
  roomTypes: RoomType[];
  /**
   * Reservation continuation URL. Defaults to the marketplace deep link
   * `/camp/{tenantId}/book`; tenant-zone pages pass `/book`.
   */
  bookUrl?: string;
}

const STORAGE_KEY = 'sc_reservation';

/** Inline stroke tent icon - same family as the shared UI icons. */
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

const T = {
  perNight: '/night',
  capacity: 'Up to {n} guests',
  bookNow: 'Book',
  modalTitle: 'Book {name}',
  checkIn: 'Check-in',
  checkOut: 'Check-out',
  guests: 'Guests',
  night: 'night',
  nights: 'nights',
  total: 'Total',
  add: 'Add to Reservation',
  added: 'Added!',
  close: '✕',
  noRooms: 'No rooms available.',
  barMsg: '{n} room(s) in reservation',
  viewSummary: 'View Summary',
  clear: 'Clear',
} as const;

function loadReservation(): ReservationItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveReservation(items: ReservationItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export default function CampBooking({ tenantId, tenantName, primaryColor, roomTypes, bookUrl }: Props) {
  const [items, setItems] = useState<ReservationItem[]>([]);
  const [modalRoom, setModalRoom] = useState<RoomType | null>(null);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState(2);
  const [justAdded, setJustAdded] = useState(false);
  const addModalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const t = T;
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => { setItems(loadReservation()); }, []);

  useEffect(() => { saveReservation(items); }, [items]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (addModalTimerRef.current) clearTimeout(addModalTimerRef.current);
    };
  }, []);

  const openModal = (rt: RoomType) => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    setModalRoom(rt);
    setGuests(Math.min(2, rt.capacity));
    setCheckIn('');
    setCheckOut('');
    setJustAdded(false);
  };

  const closeModal = useCallback(() => {
    setModalRoom(null);
    setJustAdded(false);
    previousFocusRef.current?.focus();
    previousFocusRef.current = null;
  }, []);

  // Booking modal: Escape closes, body scroll locked, focus moves into the dialog
  useEffect(() => {
    if (!modalRoom) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKeyDown);

    const focusTimer = setTimeout(() => { modalRef.current?.focus(); }, 0);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      clearTimeout(focusTimer);
      document.body.style.overflow = prevOverflow;
    };
  }, [modalRoom, closeModal]);

  // Booking modal: keep Tab focus trapped inside the dialog
  useEffect(() => {
    if (!modalRoom) return;
    const container = modalRef.current;
    if (!container) return;

    const trapFocus = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', trapFocus);
    return () => document.removeEventListener('keydown', trapFocus);
  }, [modalRoom]);

  const nights = checkIn && checkOut && checkIn < checkOut
    ? Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000)
    : 0;

  const lineTotal = modalRoom ? nights * (modalRoom.basePrice || 0) : 0;

  const addItem = useCallback(() => {
    if (!modalRoom || nights <= 0) return;
    setItems(prev => [...prev, {
      roomType: modalRoom,
      guests,
      checkIn,
      checkOut,
      nights,
      price: lineTotal,
    }]);
    setJustAdded(true);
    addModalTimerRef.current = setTimeout(() => { closeModal(); }, 800);
  }, [modalRoom, guests, checkIn, checkOut, nights, lineTotal, closeModal]);

  const clearAll = () => {
    setItems([]);
  };

  const formatPrice = (p: number) => `${p.toLocaleString()}`;

  // Readable foreground picked from WCAG luminance of the tenant primary color
  const barFg = readableTextOn(primaryColor);

  const summaryUrl = bookUrl || `/camp/${tenantId}/book`;

  return (
    <>
      {/* Room Cards Grid */}
      {roomTypes.length === 0 ? (
        <EmptyState
          icon={<TentIcon size={36} className="text-gray-300" />}
          title={t.noRooms}
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {roomTypes.map(rt => {
            const roomImg = normalizeAssetUrl(rt.imageUrl);
            return (
            <Card
              key={rt.id}
              hover
              padding="none"
              className="group rounded-2xl border border-warm-100 transition-all duration-300 hover:-translate-y-1"
            >
              {roomImg ? (
                <div className="relative h-36 overflow-hidden sm:h-44">
                  <img src={roomImg} alt={rt.name} loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-linear-to-t from-black/40 to-transparent" />
                  <Badge
                    className="absolute bottom-3 right-3 !bg-white/20 !text-white backdrop-blur-xs"
                    size="sm"
                  >
                    {t.capacity.replace('{n}', String(rt.capacity))}
                  </Badge>
                </div>
              ) : (
                <div className="relative h-36 flex items-center justify-center sm:h-44" style={{ background: `${primaryColor}08` }}>
                  <TentIcon size={44} className="opacity-60" />
                  <Badge
                    className="absolute bottom-3 right-3 !bg-white/80 !text-gray-600"
                    size="sm"
                  >
                    {t.capacity.replace('{n}', String(rt.capacity))}
                  </Badge>
                </div>
              )}
              <CardBody className="!p-5">
                <h4 className="text-lg font-extrabold mb-1">{rt.name}</h4>
                {rt.description && (
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">{rt.description}</p>
                )}
                <div className="flex items-end justify-between mt-auto">
                  <div>
                    <span className="text-2xl font-black" style={{ color: primaryColor }}>{formatPrice(rt.basePrice || 0)}</span>
                    <span className="text-xs text-gray-500 ml-1">{t.perNight}</span>
                  </div>
                  <Button
                    onClick={() => openModal(rt)}
                    size="md"
                    className="!rounded-xl"
                    style={{ background: primaryColor, color: readableTextOn(primaryColor) }}
                  >
                    {t.bookNow}
                  </Button>
                </div>
              </CardBody>
            </Card>
            );
          })}
        </div>
      )}

      {/* Floating Reservation Bar */}
      {items.length > 0 && (
        <div data-testid="reservation-bar" className="fixed bottom-0 inset-x-0 z-40 px-4 pb-4 pointer-events-none">
          <div className="max-w-lg mx-auto pointer-events-auto">
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl border border-white/20 sm:gap-3 sm:px-5 sm:py-3.5"
              style={{ background: `${primaryColor}f0`, color: barFg, backdropFilter: 'blur(12px)' }}>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{t.barMsg.replace('{n}', String(items.length))}</p>
                <p className="text-xs opacity-80">
                  {formatPrice(items.reduce((s, i) => s + i.price, 0))} EGP
                </p>
              </div>
              <Button
                onClick={clearAll}
                size="sm"
                className={cn(
                  '!rounded-xl shrink-0',
                  barFg === INK
                    ? '!bg-black/10 hover:!bg-black/20 !text-gray-700'
                    : '!bg-white/15 hover:!bg-white/25 !text-white',
                )}
              >
                {t.clear}
              </Button>
              <a href={summaryUrl}
                className="inline-flex items-center justify-center shrink-0 sm:px-5 sm:py-2.5 px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-gray-100 transition-colors sm:text-sm"
                style={{ color: primaryColor }}>
                {t.viewSummary}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Booking Modal */}
      {modalRoom && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="booking-modal-title"
          onClick={closeModal}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" aria-hidden="true" />

          {/* Modal */}
          <div
            ref={modalRef}
            tabIndex={-1}
            className="relative w-full sm:max-w-md animate-slide-up focus:outline-none"
            onClick={e => e.stopPropagation()}
          >
            <Card
              padding="none"
              className="!rounded-t-3xl !rounded-b-none sm:!rounded-2xl shadow-2xl"
            >
              {/* Header */}
              <div className="relative h-36 overflow-hidden">
                {normalizeAssetUrl(modalRoom.imageUrl) ? (
                  <img src={normalizeAssetUrl(modalRoom.imageUrl)} alt={modalRoom.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ background: `${primaryColor}10` }}>
                    <TentIcon size={48} />
                  </div>
                )}
                <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />
                <button onClick={closeModal}
                  className="absolute top-3 left-3 w-10 h-10 rounded-full bg-black/30 backdrop-blur-xs text-white flex items-center justify-center hover:bg-black/50 transition-colors text-sm font-bold min-h-[44px] min-w-[44px]">
                  {t.close}
                </button>
                <div className="absolute bottom-4 right-4 left-4">
                  <h3 id="booking-modal-title" className="text-xl font-black text-white">{t.modalTitle.replace('{name}', modalRoom.name)}</h3>
                  <p className="text-sm text-white/80">{modalRoom.basePrice || 0} EGP {t.perNight} · {t.capacity.replace('{n}', String(modalRoom.capacity))}</p>
                </div>
              </div>

              {/* Form */}
              <div data-testid="booking-form" className="p-5 space-y-4">
                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    type="date"
                    label={t.checkIn}
                    value={checkIn}
                    min={today}
                    onChange={e => { setCheckIn(e.target.value); if (e.target.value >= checkOut) setCheckOut(''); setJustAdded(false); }}
                    className="!rounded-xl"
                    data-testid="checkin-date"
                  />
                  <Input
                    type="date"
                    label={t.checkOut}
                    value={checkOut}
                    min={checkIn || today}
                    onChange={e => { setCheckOut(e.target.value); setJustAdded(false); }}
                    className="!rounded-xl"
                    data-testid="checkout-date"
                  />
                </div>

                {nights > 0 && (
                  <p className="text-center text-xs text-gray-500 font-semibold">
                    {nights} {nights === 1 ? t.night : t.nights}
                  </p>
                )}

                {/* Guests */}
                <div>
                  <label id="guest-count-label" className="block text-sm font-medium text-gray-700 mb-2">{t.guests}</label>
                  <div className="flex items-center justify-center gap-4">
                    <button onClick={() => setGuests(g => Math.max(1, g - 1))}
                      aria-label="Decrease guests"
                      className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold bg-gray-100 hover:bg-gray-200 transition-colors text-gray-600 active:scale-95">
                      −
                    </button>
                    <span data-testid="guest-count" className="text-3xl font-black w-12 text-center" style={{ color: primaryColor }}>{guests}</span>
                    <button onClick={() => setGuests(g => Math.min(modalRoom.capacity, g + 1))}
                      aria-label="Increase guests"
                      className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold bg-gray-100 hover:bg-gray-200 transition-colors text-gray-600 active:scale-95">
                      +
                    </button>
                  </div>
                  <p className="text-center text-[11px] text-gray-500 mt-1">
                    {modalRoom.capacity} max
                  </p>
                </div>

                {/* Total + Add */}
                {nights > 0 && (
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <span className="text-sm text-gray-500">{t.total}</span>
                      <span className="text-2xl font-black" style={{ color: primaryColor }}>
                        {formatPrice(lineTotal)} <span className="text-sm font-semibold text-gray-500">EGP</span>
                      </span>
                    </div>
                    <Button
                      onClick={addItem}
                      disabled={justAdded}
                      fullWidth
                      variant={justAdded ? 'success' : 'primary'}
                      className="!rounded-xl !py-3.5 !text-base"
                      style={justAdded ? {} : { background: primaryColor, color: readableTextOn(primaryColor) }}
                      data-testid="whatsapp-submit"
                    >
                      {justAdded ? `✓ ${t.added}` : t.add}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up { animation: slide-up 0.3s ease-out; }
        @media (min-width: 640px) {
          .animate-slide-up { animation: fade-in 0.2s ease-out; }
        }
        @keyframes fade-in {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-slide-up { animation: none; }
        }
        input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.5; }
      `}</style>
    </>
  );
}
