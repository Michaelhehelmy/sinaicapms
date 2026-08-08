import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useI18n } from '@/hooks/useI18n';
import { setLocale } from '@/i18n';

describe('useI18n', () => {
  beforeEach(() => {
    setLocale('en');
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = 'en';
  });

  it('returns t function', () => {
    const { result } = renderHook(() => useI18n());
    expect(typeof result.current.t).toBe('function');
  });

  it('returns default locale as en', () => {
    setLocale('en');
    const { result } = renderHook(() => useI18n());
    expect(result.current.locale).toBe('en');
  });

  it('returns isRTL as false for English', () => {
    setLocale('en');
    const { result } = renderHook(() => useI18n());
    expect(result.current.isRTL).toBe(false);
  });

  it('returns direction as ltr for English', () => {
    setLocale('en');
    const { result } = renderHook(() => useI18n());
    expect(result.current.direction).toBe('ltr');
  });

  it('changeLocale switches to Arabic', () => {
    setLocale('en');
    const { result } = renderHook(() => useI18n());
    act(() => {
      result.current.changeLocale('ar');
    });
    expect(result.current.locale).toBe('ar');
    expect(result.current.isRTL).toBe(true);
    expect(result.current.direction).toBe('rtl');
  });

  it('changeLocale updates document.documentElement.dir', () => {
    setLocale('en');
    const { result } = renderHook(() => useI18n());
    act(() => {
      result.current.changeLocale('ar');
    });
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('changeLocale updates document.documentElement.lang', () => {
    const { result } = renderHook(() => useI18n());
    act(() => {
      result.current.changeLocale('ar');
    });
    expect(document.documentElement.lang).toBe('ar');
  });

  it('changeLocale switches back to English', () => {
    setLocale('ar');
    const { result } = renderHook(() => useI18n());
    act(() => {
      result.current.changeLocale('en');
    });
    expect(result.current.locale).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('t function returns translated value', () => {
    const { result } = renderHook(() => useI18n());
    // The t function should be the same as the i18n t function
    const value = result.current.t('nav.home');
    expect(typeof value).toBe('string');
  });

  it('t function returns key for missing translation', () => {
    const { result } = renderHook(() => useI18n());
    const value = result.current.t('nonexistent.key.here');
    expect(value).toBe('nonexistent.key.here');
  });
});
