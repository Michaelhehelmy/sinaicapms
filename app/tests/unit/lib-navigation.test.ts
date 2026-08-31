import { describe, it, expect, vi, afterEach } from 'vitest';
import { push, replace, back, parseHashTab } from '@/lib/navigation';
import { onNavigation as onNav } from '@/lib/navigation';

function mockLocation(hostname: string) {
  const win = window as any;
  win.__origPush = win.history.pushState;
  win.__origReplace = win.history.replaceState;
  win.__origBack = win.history.back;
  win.history.pushState = vi.fn();
  win.history.replaceState = vi.fn();
  win.history.back = vi.fn();
  const addSpy = vi.spyOn(window, 'addEventListener');
  return { addSpy };
}

afterEach(() => {
  const win = window as any;
  if (win.__origPush) {
    win.history.pushState = win.__origPush;
    win.history.replaceState = win.__origReplace;
    win.history.back = win.__origBack;
    delete win.__origPush;
    delete win.__origReplace;
    delete win.__origBack;
  }
});

describe('lib/navigation', () => {
  it('parseHashTab parses legacy deep links', () => {
    expect(parseHashTab('#tab=rooms')).toBe('rooms');
    expect(parseHashTab('#/tab=rooms')).toBe('rooms');
    expect(parseHashTab('  #tab=Rooms%20List')).toBe('Rooms List');
    expect(parseHashTab('#other=1')).toBeNull();
    expect(parseHashTab('')).toBeNull();
    expect(parseHashTab(undefined)).toBeNull();
    expect(parseHashTab('#tab=')).toBeNull();
  });

  it('push adds a history entry and emits to subscribers', () => {
    mockLocation('sinaicamps.com');
    const listener = vi.fn();
    const unsub = onNav(listener);
    push('/admin/camps');
    expect(window.history.pushState).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.any(String), url: expect.any(String) })
    );
    unsub();
    push('/admin/orders');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('replace swaps the current history entry and emits', () => {
    mockLocation('sinaicamps.com');
    const listener = vi.fn();
    onNav(listener);
    replace('/admin/settings');
    expect(window.history.replaceState).toHaveBeenCalled();
    expect(listener).toHaveBeenCalled();
  });

  it('back rides window.history.back', () => {
    mockLocation('sinaicamps.com');
    back();
    expect(window.history.back).toHaveBeenCalled();
  });

  it('onNavigation installs a popstate listener lazily exactly once', () => {
    mockLocation('sinaicamps.com');
    const a = onNav(() => {});
    const b = onNav(() => {});
    expect(window.addEventListener).toHaveBeenCalledWith('popstate', expect.any(Function));
    b();
    a();
  });
});

describe('lib/navigation — SSR guards (window undefined)', () => {
  it('push/replace/back/onNavigation are no-ops without window', () => {
    const win = globalThis as any;
    const savedWindow = win.window;
    // Simulate SSR by removing window from globalThis.
    let emitListener: any = null;
    const fakeWindow = {
      location: { pathname: '/', href: 'http://x/' },
      history: {
        pushState: vi.fn(),
        replaceState: vi.fn(),
        back: vi.fn(),
      },
      addEventListener: (_t: string, fn: any) => {
        emitListener = fn;
      },
    };
    win.window = fakeWindow;
    (win.__origNavWindow = savedWindow);
    // With window present, push should emit
    push('/admin/x');
    expect(fakeWindow.history.pushState).toHaveBeenCalled();
    // With window absent (SSR), should silently no-op
    win.window = undefined;
    expect(() => push('/admin/x')).not.toThrow();
    expect(() => replace('/admin/x')).not.toThrow();
    expect(() => back()).not.toThrow();
    expect(parseHashTab(undefined)).toBeNull();
    win.window = win.__origNavWindow;
  });
});
