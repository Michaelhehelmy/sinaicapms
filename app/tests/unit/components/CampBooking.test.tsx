import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import CampBooking from '@/components/public/CampBooking';

const roomTypes = [
  { id: '1', name: 'Deluxe Tent', capacity: 4, basePrice: 1200, description: 'A tent', imageUrl: '' },
  { id: '2', name: 'Standard Tent', capacity: 2, basePrice: 800 },
];

const defaultProps = {
  tenantId: 't1',
  tenantName: 'Test Camp',
  primaryColor: '#1a73e8',
  roomTypes,
};

function openModal() {
  const bookButtons = screen.getAllByText('Book');
  fireEvent.click(bookButtons[0].closest('button')!);
}

describe('CampBooking', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders room cards', () => {
    render(<CampBooking {...defaultProps} />);
    expect(screen.getByText('Deluxe Tent')).toBeInTheDocument();
    expect(screen.getByText('Standard Tent')).toBeInTheDocument();
  });

  it('shows empty state when no rooms', () => {
    render(<CampBooking {...defaultProps} roomTypes={[]} />);
    expect(screen.getByText('No rooms available.')).toBeInTheDocument();
  });

  it('opens booking modal on Book click', () => {
    render(<CampBooking {...defaultProps} />);
    openModal();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Book Deluxe Tent')).toBeInTheDocument();
  });

  it('closes modal when clicking backdrop', () => {
    render(<CampBooking {...defaultProps} />);
    openModal();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes modal on Escape key (line 142)', () => {
    render(<CampBooking {...defaultProps} />);
    openModal();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('adds room to reservation', () => {
    render(<CampBooking {...defaultProps} />);
    openModal();
    fireEvent.change(screen.getByTestId('checkin-date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByTestId('checkout-date'), { target: { value: '2026-09-03' } });
    fireEvent.click(screen.getByTestId('whatsapp-submit'));
    expect(screen.getByText(/room\(s\) in reservation/)).toBeInTheDocument();
  });

  it('clears all reservations', () => {
    render(<CampBooking {...defaultProps} />);
    openModal();
    fireEvent.change(screen.getByTestId('checkin-date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByTestId('checkout-date'), { target: { value: '2026-09-03' } });
    fireEvent.click(screen.getByTestId('whatsapp-submit'));
    expect(screen.getByText(/room\(s\) in reservation/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Clear'));
    expect(screen.queryByTestId('reservation-bar')).not.toBeInTheDocument();
  });

  it('adjusts guest count', () => {
    render(<CampBooking {...defaultProps} />);
    openModal();
    const inc = screen.getByLabelText('Increase guests');
    const dec = screen.getByLabelText('Decrease guests');
    expect(screen.getByTestId('guest-count')).toHaveTextContent('2');
    fireEvent.click(inc);
    expect(screen.getByTestId('guest-count')).toHaveTextContent('3');
    fireEvent.click(dec);
    expect(screen.getByTestId('guest-count')).toHaveTextContent('2');
  });

  it('traps Tab focus inside modal — Tab from last goes to first (lines 162-176)', () => {
    render(<CampBooking {...defaultProps} />);
    openModal();
    const dialog = screen.getByRole('dialog');
    const focusableEls = dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    expect(focusableEls.length).toBeGreaterThan(0);
    const first = focusableEls[0];
    const last = focusableEls[focusableEls.length - 1];

    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('traps Shift+Tab focus inside modal — Shift+Tab from first goes to last (lines 169-173)', () => {
    render(<CampBooking {...defaultProps} />);
    openModal();
    const dialog = screen.getByRole('dialog');
    const focusableEls = dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = focusableEls[0];
    const last = focusableEls[focusableEls.length - 1];

    first.focus();
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('does nothing on Tab when focus is not on first/last element', () => {
    render(<CampBooking {...defaultProps} />);
    openModal();
    const dialog = screen.getByRole('dialog');
    const focusableEls = dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusableEls.length >= 3) {
      const middle = focusableEls[Math.floor(focusableEls.length / 2)];
      middle.focus();
      fireEvent.keyDown(dialog, { key: 'Tab' });
      expect(document.activeElement).toBe(middle);
    }
  });

  it('supports custom bookUrl', () => {
    render(<CampBooking {...defaultProps} bookUrl="/custom-book" />);
    openModal();
    fireEvent.change(screen.getByTestId('checkin-date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByTestId('checkout-date'), { target: { value: '2026-09-03' } });
    fireEvent.click(screen.getByTestId('whatsapp-submit'));
    const link = screen.getByText('View Summary').closest('a');
    expect(link).toHaveAttribute('href', '/custom-book');
  });
});
