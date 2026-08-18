import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ReservationSummary from '@/components/public/ReservationSummary';

const reservationItem = {
  roomType: { id: 'r1', name: 'Deluxe Tent', capacity: 4, basePrice: 1200 },
  guests: 2,
  checkIn: '2026-09-01',
  checkOut: '2026-09-03',
  nights: 2,
  price: 2400,
};

const defaultProps = {
  tenantId: 't1',
  tenantName: 'Test Camp',
  primaryColor: '#1a73e8',
  whatsappNumber: '201234567890',
};

function setReservation(items = [reservationItem]) {
  localStorage.setItem('sc_reservation', JSON.stringify(items));
}

describe('ReservationSummary', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows empty state when no reservation', () => {
    render(<ReservationSummary {...defaultProps} />);
    expect(screen.getByText('No rooms in your reservation.')).toBeInTheDocument();
  });

  it('renders reservation items', () => {
    setReservation();
    render(<ReservationSummary {...defaultProps} />);
    expect(screen.getByText('Deluxe Tent')).toBeInTheDocument();
    // Price appears twice (card + total)
    expect(screen.getAllByText('2,400 EGP').length).toBeGreaterThanOrEqual(1);
  });

  it('removes an item', () => {
    setReservation();
    render(<ReservationSummary {...defaultProps} />);
    fireEvent.click(screen.getByText('Remove'));
    expect(screen.getByText('No rooms in your reservation.')).toBeInTheDocument();
  });

  it('guest name input updates state', () => {
    setReservation();
    render(<ReservationSummary {...defaultProps} />);
    const nameInput = screen.getByPlaceholderText('Enter your full name');
    fireEvent.change(nameInput, { target: { value: 'John Doe' } });
    expect(nameInput).toHaveValue('John Doe');
  });

  it('guest phone input updates state (line 308)', () => {
    setReservation();
    render(<ReservationSummary {...defaultProps} />);
    const phoneInput = screen.getByPlaceholderText('+20 1XX XXX XXXX');
    fireEvent.change(phoneInput, { target: { value: '+20 111 222 3333' } });
    expect(phoneInput).toHaveValue('+20 111 222 3333');
  });

  it('WhatsApp button is disabled without name', () => {
    setReservation();
    render(<ReservationSummary {...defaultProps} />);
    const waBtn = screen.getByText('Send Booking via WhatsApp');
    expect(waBtn.closest('button')).toBeDisabled();
  });

  it('WhatsApp button is enabled with name', () => {
    setReservation();
    render(<ReservationSummary {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText('Enter your full name'), { target: { value: 'John' } });
    const waBtn = screen.getByText('Send Booking via WhatsApp');
    expect(waBtn.closest('button')).not.toBeDisabled();
  });

  it('submits lead to API when apiBase is provided (lines 170-173)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);
    setReservation();
    render(<ReservationSummary {...defaultProps} apiBase="https://api.example.com/api" />);
    fireEvent.change(screen.getByPlaceholderText('Enter your full name'), { target: { value: 'John Doe' } });
    fireEvent.change(screen.getByPlaceholderText('+20 1XX XXX XXXX'), { target: { value: '+20 111 222 3333' } });

    await act(async () => {
      fireEvent.click(screen.getByText('Send Booking via WhatsApp'));
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.example.com/api/leads',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.name).toBe('John Doe');
    expect(body.phone).toBe('+20 111 222 3333');
    expect(body.source).toBe('booking');
    expect(body.message).toContain('Deluxe Tent');
    expect(body.message).toContain('Total');
  });

  it('does not submit lead when apiBase is absent', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);
    setReservation();
    render(<ReservationSummary {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText('Enter your full name'), { target: { value: 'John Doe' } });

    await act(async () => {
      fireEvent.click(screen.getByText('Send Booking via WhatsApp'));
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('lead capture failure does not throw (fire-and-forget)', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchSpy);
    setReservation();
    render(<ReservationSummary {...defaultProps} apiBase="https://api.example.com/api" />);
    fireEvent.change(screen.getByPlaceholderText('Enter your full name'), { target: { value: 'John Doe' } });

    await act(async () => {
      fireEvent.click(screen.getByText('Send Booking via WhatsApp'));
    });

    expect(fetchSpy).toHaveBeenCalled();
  });

  it('copy summary button works', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    setReservation();
    render(<ReservationSummary {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText('Enter your full name'), { target: { value: 'Jane' } });

    await act(async () => {
      fireEvent.click(screen.getByText('Copy Booking Summary'));
    });

    expect(writeText).toHaveBeenCalled();
  });

  it('renders back to camp link with custom campUrl', () => {
    setReservation();
    render(<ReservationSummary {...defaultProps} campUrl="/my-camp" />);
    const backLink = screen.getByText(/Back to Camp/).closest('a');
    expect(backLink).toHaveAttribute('href', '/my-camp');
  });

  it('renders default campUrl from tenantId', () => {
    setReservation();
    render(<ReservationSummary {...defaultProps} />);
    const backLink = screen.getByText(/Back to Camp/).closest('a');
    expect(backLink).toHaveAttribute('href', '/camp/t1');
  });

  it('loads reservation from localStorage on mount', () => {
    setReservation();
    render(<ReservationSummary {...defaultProps} />);
    expect(screen.getByText('Deluxe Tent')).toBeInTheDocument();
    expect(screen.getByText('Your Reservation')).toBeInTheDocument();
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('sc_reservation', '{invalid json');
    render(<ReservationSummary {...defaultProps} />);
    expect(screen.getByText('No rooms in your reservation.')).toBeInTheDocument();
  });
});
