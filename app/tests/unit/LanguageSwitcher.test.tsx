import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';

let currentLocale = 'en';
const mockChangeLocale = vi.fn((newLocale: string) => {
  currentLocale = newLocale;
});

vi.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    locale: currentLocale,
    changeLocale: mockChangeLocale,
    isRTL: currentLocale === 'ar',
    direction: currentLocale === 'ar' ? 'rtl' : 'ltr',
  }),
}));

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    currentLocale = 'en';
    mockChangeLocale.mockClear();
  });

  it('renders with English locale showing Arabic option', () => {
    currentLocale = 'en';
    render(<LanguageSwitcher />);
    expect(screen.getByText('عربي')).toBeInTheDocument();
    expect(screen.getByRole('button').querySelector('svg')).toBeInTheDocument();
  });

  it('has correct aria-label for English locale', () => {
    currentLocale = 'en';
    render(<LanguageSwitcher />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Switch to Arabic');
  });

  it('has correct aria-label for Arabic locale', () => {
    currentLocale = 'ar';
    render(<LanguageSwitcher />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Switch to English');
  });

  it('renders with Arabic locale showing English option', () => {
    currentLocale = 'ar';
    render(<LanguageSwitcher />);
    expect(screen.getByText('EN')).toBeInTheDocument();
    expect(screen.getByRole('button').querySelector('svg')).toBeInTheDocument();
  });

  it('calls changeLocale to ar when clicked from English', () => {
    currentLocale = 'en';
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole('button'));
    expect(mockChangeLocale).toHaveBeenCalledWith('ar');
  });

  it('calls changeLocale to en when clicked from Arabic', () => {
    currentLocale = 'ar';
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole('button'));
    expect(mockChangeLocale).toHaveBeenCalledWith('en');
  });

  it('renders as a button element', () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
