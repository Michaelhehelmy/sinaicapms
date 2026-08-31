import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  session,
  TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  POS_TOKEN_KEY,
  USER_KEY,
} from '@/lib/session';

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('lib/session — constants', () => {
  it('exposes legacy key names', () => {
    expect(TOKEN_KEY).toBe('sinaicamps_token');
    expect(REFRESH_TOKEN_KEY).toBe('sinaicamps_refresh_token');
    expect(POS_TOKEN_KEY).toBe('pos_token');
    expect(USER_KEY).toBe('sinaicamps_user');
  });
});

describe('lib/session — admin realm', () => {
  it('reads/writes tokens and emits auth change', () => {
    const listener = vi.fn();
    const unsub = session.onAuthChange(listener);
    session.setTokens('admin', 'abc123', 'refresh123');
    expect(session.getAccessToken('admin')).toBe('abc123');
    expect(session.getRefreshToken('admin')).toBe('refresh123');
    expect(listener).toHaveBeenCalledWith({ realm: 'admin', authenticated: true });
    unsub();
    session.setTokens('admin', 'xyz');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('setTokens ignores empty null refresh token', () => {
    window.localStorage.setItem('sinaicamps_refresh_token', 'OLD');
    session.setTokens('admin', 'newAccess', null);
    expect(session.getRefreshToken('admin')).toBe('OLD');
    session.setTokens('admin', 'newAccess', '');
    expect(session.getRefreshToken('admin')).toBe('OLD');
  });

  it('clear() with a realm removes all three keys for that realm', () => {
    session.setTokens('admin', 'a', 'r');
    session.setUser('admin', { id: 1 });
    session.clear('admin');
    expect(session.getAccessToken('admin')).toBeNull();
    expect(session.getRefreshToken('admin')).toBeNull();
    expect(session.getUser('admin')).toBeNull();
  });

  it('clear() without realm clears every realm and emits per realm', () => {
    const listener = vi.fn();
    session.onAuthChange(listener);
    session.setTokens('admin', 'a', 'r');
    session.setTokens('pos', 'p', 'pr');
    session.setUser('admin', {});
    session.setUser('pos', {});
    session.clear();
    expect(session.getAccessToken('admin')).toBeNull();
    expect(session.getAccessToken('pos')).toBeNull();
    expect(listener).toHaveBeenCalled();
  });

  it('getUser parses JSON and returns null on corrupt data', () => {
    session.setUser('admin', { name: 'Ali' });
    expect(session.getUser('admin')).toEqual({ name: 'Ali' });
    window.localStorage.setItem('sinaicamps_user', 'not json{{');
    expect(session.getUser('admin')).toBeNull();
    expect(session.getUser('pos')).toBeNull();
  });
});

describe('lib/session — pos realm', () => {
  it('uses separate pos keys', () => {
    session.setTokens('pos', 'posAccess', 'posRefresh');
    expect(session.getAccessToken('admin')).toBeNull();
    expect(session.getAccessToken('pos')).toBe('posAccess');
    expect(session.getRefreshToken('pos')).toBe('posRefresh');
  });
});

describe('lib/session — resilience', () => {
  it('handles storage read/write throwing without crashing', () => {
    const getSpy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    const setSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota');
      });
    const removeSpy = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    expect(session.getAccessToken('admin')).toBeNull();
    expect(() => session.setTokens('admin', 'a')).not.toThrow();
    expect(() => session.clear()).not.toThrow();
    getSpy.mockRestore();
    setSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('a broken auth listener does not break other listeners', () => {
    const listener = vi.fn();
    session.onAuthChange(() => {
      throw new Error('boom');
    });
    session.onAuthChange(listener);
    session.setTokens('admin', 'a');
    expect(listener).toHaveBeenCalled();
  });
});
