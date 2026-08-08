import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  t,
  setLocale,
  getLocale,
  isRTL,
  getDirection,
  createI18n,
  I18nProvider,
  DEFAULT_LOCALE,
} from '@/i18n';
import { useI18n } from '@/hooks/useI18n';

// Every test starts from a clean English shim + LTR document so no state can
// bleed between tests (the shim lives on `window` within this jsdom file).
beforeEach(() => {
  setLocale('en');
  document.documentElement.dir = 'ltr';
  document.documentElement.lang = 'en';
});

/**
 * Probe component used to prove React-context isolation: renders the resolved
 * `locale:direction:translation` for `probeKey` plus a button that switches to
 * Arabic (exercising the provider path of `useI18n`).
 */
function I18nProbe({ probeKey }: { probeKey: string }) {
  const { locale, direction, t: translate, changeLocale } = useI18n();
  return createElement(
    'div',
    null,
    createElement(
      'span',
      { 'data-testid': 'i18n-probe' },
      `${locale}:${direction}:${translate(probeKey)}`
    ),
    createElement('button', { onClick: () => changeLocale('ar') }, 'to-ar')
  );
}

describe('i18n — pure per-locale API (createI18n)', () => {
  it('defaults to English on a fresh instance', () => {
    const i18n = createI18n();
    expect(i18n.locale).toBe(DEFAULT_LOCALE);
    expect(i18n.t('common.save')).toBe('Save');
    expect(i18n.isRTL).toBe(false);
    expect(i18n.direction).toBe('ltr');
  });

  it('resolves English translations', () => {
    const i18n = createI18n('en');
    expect(i18n.t('common.save')).toBe('Save');
    expect(i18n.t('nav.home')).toBe('Home');
  });

  it('resolves Arabic translations', () => {
    const i18n = createI18n('ar');
    expect(i18n.t('common.save')).toBe('حفظ');
    expect(i18n.t('nav.home')).toBe('الرئيسية');
  });

  it('returns RTL for Arabic and LTR for English', () => {
    expect(createI18n('ar').isRTL).toBe(true);
    expect(createI18n('ar').direction).toBe('rtl');
    expect(createI18n('ar').getDirection()).toBe('rtl');
    expect(createI18n('en').isRTL).toBe(false);
    expect(createI18n('en').direction).toBe('ltr');
  });
});

describe('i18n — per-context isolation (no module-global bleed)', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('resolves en and ar contexts concurrently without bleed', () => {
    const enCtx = createI18n('en');
    const arCtx = createI18n('ar');

    // Interleave calls — any shared module-level state would leak between the
    // two independent contexts.
    expect(enCtx.t('common.save')).toBe('Save');
    expect(arCtx.t('common.save')).toBe('حفظ');
    expect(enCtx.t('nav.home')).toBe('Home');
    expect(arCtx.t('nav.home')).toBe('الرئيسية');
    expect(arCtx.t('common.save')).toBe('حفظ');
    expect(enCtx.t('common.save')).toBe('Save');
    expect(enCtx.locale).toBe('en');
    expect(arCtx.locale).toBe('ar');
  });

  it('resolves independently across two providers in the same React tree', () => {
    render(
      createElement(
        'div',
        null,
        createElement(
          I18nProvider,
          { locale: 'en' },
          createElement(I18nProbe, { probeKey: 'common.save' })
        ),
        createElement(
          I18nProvider,
          { locale: 'ar' },
          createElement(I18nProbe, { probeKey: 'common.save' })
        )
      )
    );

    const probes = screen.getAllByTestId('i18n-probe');
    expect(probes.map((node) => node.textContent)).toEqual(['en:ltr:Save', 'ar:rtl:حفظ']);
  });

  it('provider changeLocale propagates to consumers and syncs the DOM', () => {
    render(
      createElement(I18nProvider, null, createElement(I18nProbe, { probeKey: 'common.save' }))
    );
    expect(screen.getByTestId('i18n-probe').textContent).toBe('en:ltr:Save');

    fireEvent.click(screen.getByText('to-ar'));

    expect(screen.getByTestId('i18n-probe').textContent).toBe('ar:rtl:حفظ');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });
});

describe('i18n — explicit locale param (stateless SSR usage)', () => {
  it('t accepts an explicit locale without touching shared state', () => {
    expect(t('common.save', undefined, 'en')).toBe('Save');
    expect(t('common.save', undefined, 'ar')).toBe('حفظ');
  });

  it('isRTL/getDirection accept an explicit locale', () => {
    expect(isRTL('ar')).toBe(true);
    expect(isRTL('en')).toBe(false);
    expect(getDirection('ar')).toBe('rtl');
    expect(getDirection('en')).toBe('ltr');
  });
});

describe('i18n — interpolation', () => {
  it('replaces {param} placeholders', () => {
    expect(t('booking.nights', { count: 3 })).toBe('3 nights');
    expect(t('booking.nights', { count: 4 }, 'ar')).toBe('4 ليالٍ');
    expect(t('common.showing', { from: 1, to: 10, total: 50 })).toBe('Showing 1-10 of 50');
  });
});

describe('i18n — missing keys', () => {
  it('returns the key itself for unknown keys', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key');
    expect(t('common.doesNotExist')).toBe('common.doesNotExist');
    expect(createI18n('ar').t('nope')).toBe('nope');
  });
});

describe('i18n — browser compatibility shim (setLocale/getLocale)', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('returns English by default', () => {
    expect(getLocale()).toBe('en');
    expect(t('common.save')).toBe('Save');
  });

  it('switches to Arabic', () => {
    setLocale('ar');
    expect(getLocale()).toBe('ar');
    expect(t('common.save')).toBe('حفظ');
  });

  it('isRTL/getDirection follow the shim locale', () => {
    setLocale('ar');
    expect(isRTL()).toBe(true);
    expect(getDirection()).toBe('rtl');
    setLocale('en');
    expect(isRTL()).toBe(false);
    expect(getDirection()).toBe('ltr');
  });

  it('getLocale returns the current shim locale', () => {
    setLocale('en');
    expect(getLocale()).toBe('en');
    setLocale('ar');
    expect(getLocale()).toBe('ar');
  });
});

describe('i18n — fresh server request (no window)', () => {
  it('defaults to English and ignores setLocale when window is absent', () => {
    vi.stubGlobal('window', undefined);
    try {
      expect(getLocale()).toBe('en');
      setLocale('ar'); // must be a no-op outside the browser
      expect(getLocale()).toBe('en');
      expect(t('common.save')).toBe('Save');
      // Explicit-locale translation still works server-side (per-request).
      expect(t('common.save', undefined, 'ar')).toBe('حفظ');
      expect(isRTL()).toBe(false);
      expect(getDirection()).toBe('ltr');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
