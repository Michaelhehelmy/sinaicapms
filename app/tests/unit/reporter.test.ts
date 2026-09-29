import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveReportConfig,
  REPORT_URL,
  PUBLIC_REPORT_TOKEN,
  reportError,
  reportFeedback,
  initErrorReporting,
} from '@/lib/reporter';

const fetchMock = vi.fn();
const prevOnError = window.onerror;
const prevRejection = window.onunhandledrejection;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  window.onerror = prevOnError ?? null;
  window.onunhandledrejection = prevRejection ?? null;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.onerror = prevOnError ?? null;
  window.onunhandledrejection = prevRejection ?? null;
});

describe('resolveReportConfig', () => {
  it('defaults to the monitor origin with an empty token', () => {
    expect(resolveReportConfig({})).toEqual({ url: 'https://status.sinaicamps.com', token: '' });
  });

  it('honors explicit URL + token overrides', () => {
    expect(
      resolveReportConfig({ PUBLIC_REPORT_URL: 'https://monitor.example.com', PUBLIC_REPORT_TOKEN: 'tok' }),
    ).toEqual({ url: 'https://monitor.example.com', token: 'tok' });
  });

  it('falls back to the default when the URL override is blank', () => {
    expect(resolveReportConfig({ PUBLIC_REPORT_URL: '   ' }).url).toBe('https://status.sinaicamps.com');
  });

  it('strips trailing slashes and trims the token', () => {
    expect(
      resolveReportConfig({ PUBLIC_REPORT_URL: 'https://monitor.example.com///', PUBLIC_REPORT_TOKEN: '  tok  ' }),
    ).toEqual({ url: 'https://monitor.example.com', token: 'tok' });
  });
});

describe('module defaults (tokenless test env)', () => {
  it('exports the monitor REPORT_URL', () => {
    expect(REPORT_URL).toBe('https://status.sinaicamps.com');
  });

  it('exports an empty PUBLIC_REPORT_TOKEN', () => {
    expect(PUBLIC_REPORT_TOKEN).toBe('');
  });
});

describe('no-token silent no-op', () => {
  it('reportError never fetches, throws, or logs without a token', () => {
    expect(() => reportError('kaboom')).not.toThrow();
    expect(() => reportError('kaboom', { pageUrl: 'https://x/page', contact: 'a@b.c' })).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reportFeedback never fetches, throws, or logs without a token', () => {
    expect(() => reportFeedback({ message: 'nice flow' })).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blank messages are dropped even with a token configured', async () => {
    vi.resetModules();
    vi.stubEnv('PUBLIC_REPORT_TOKEN', 'tok123');
    const mod = await import('@/lib/reporter');
    mod.reportError('   ');
    mod.reportFeedback({ message: '' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('error-shape payload (token configured)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function tokenedReporter() {
    vi.stubEnv('PUBLIC_REPORT_TOKEN', 'tok123');
    return import('@/lib/reporter');
  }

  it('POSTs {message, page_url, contact} to /report/error with keepalive + Bearer', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const mod = await tokenedReporter();
    mod.reportError('kaboom', { pageUrl: 'https://acaciacamp.com/admin', contact: 'tester@x.com' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { keepalive?: boolean }];
    expect(url).toBe('https://status.sinaicamps.com/report/error');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok123',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      message: 'kaboom',
      page_url: 'https://acaciacamp.com/admin',
      contact: 'tester@x.com',
    });
  });

  it('defaults page_url to window.location.href and contact to null', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const mod = await tokenedReporter();
    mod.reportError('kaboom');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      message: 'kaboom',
      page_url: window.location.href,
      contact: null,
    });
  });

  it('truncates overlong messages to the 2000-char intake cap', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const mod = await tokenedReporter();
    mod.reportError('a'.repeat(2500));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((JSON.parse(String(init.body)) as { message: string }).message).toHaveLength(2000);
  });

  it('reportFeedback POSTs to /report/feedback', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const mod = await tokenedReporter();
    mod.reportFeedback({ message: 'confusing flow', pageUrl: 'https://x/y', contact: 't@x.com' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://status.sinaicamps.com/report/feedback');
    expect(JSON.parse(String(init.body))).toEqual({
      message: 'confusing flow',
      page_url: 'https://x/y',
      contact: 't@x.com',
    });
  });

  it('swallows async intake rejections and sync fetch throws', async () => {
    const mod = await tokenedReporter();
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    expect(() => mod.reportError('kaboom')).not.toThrow();
    fetchMock.mockImplementationOnce(() => {
      throw new Error('sync throw');
    });
    expect(() => mod.reportError('kaboom')).not.toThrow();
    // Let the rejected promise settle — an unhandled rejection here fails the run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('initErrorReporting', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function tokenedReporter() {
    vi.stubEnv('PUBLIC_REPORT_TOKEN', 'tok123');
    fetchMock.mockResolvedValue({ ok: true });
    return import('@/lib/reporter');
  }

  it('installs window.onerror and forwards to /report/error', async () => {
    const mod = await tokenedReporter();
    mod.initErrorReporting();
    expect(typeof window.onerror).toBe('function');
    const handler = window.onerror as unknown as (...args: unknown[]) => unknown;
    handler?.call(window, 'plain string boom', 'https://x/app.js', 10, 20, undefined, window.event);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://status.sinaicamps.com/report/error');
    expect(JSON.parse(String(init.body))).toMatchObject({ message: 'plain string boom' });
  });

  it('prefers the Error stack when present and preserves the previous handler', async () => {
    const mod = await tokenedReporter();
    const prev = vi.fn();
    window.onerror = prev;
    mod.initErrorReporting();
    const err = new Error('stacked boom');
    (window.onerror as unknown as (...args: unknown[]) => unknown)?.call(window, 'ignored', undefined, undefined, undefined, err, undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((JSON.parse(String(init.body)) as { message: string }).message).toContain('stacked boom');
    expect(prev).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — a second install does not double-report', async () => {
    const mod = await tokenedReporter();
    mod.initErrorReporting();
    mod.initErrorReporting();
    (window.onerror as unknown as (...args: unknown[]) => unknown)?.call(window, 'once', undefined, undefined, undefined, undefined, undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('forwards unhandledrejection reasons', async () => {
    const mod = await tokenedReporter();
    mod.initErrorReporting();
    window.onunhandledrejection?.call(window, { reason: new Error('rejected boom') } as PromiseRejectionEvent);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((JSON.parse(String(init.body)) as { message: string }).message).toContain('rejected boom');
  });

  it('is a silent no-op without a token (handlers install, nothing sent)', async () => {
    vi.resetModules();
    const mod = await import('@/lib/reporter');
    mod.initErrorReporting();
    (window.onerror as unknown as (...args: unknown[]) => unknown)?.call(window, 'quiet', undefined, undefined, undefined, undefined, undefined);
    window.onunhandledrejection?.call(window, { reason: 'quiet' } as PromiseRejectionEvent);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
