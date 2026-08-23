// Phase 6 / Task 1 — Multi-realm session kernel (Unified Architecture Plan §6).
//
// Single source of truth for browser-side session storage across both auth
// realms (admin marketplace + POS terminal). apiFetch consumes this store
// instead of touching localStorage directly; UI code (AuthProvider, POSApp,
// BookingCalendar SSE) reads tokens through it too.
//
// Seeding guarantee: the canonical keys ARE the legacy keys
// (`sinaicamps_token`, `sinaicamps_refresh_token`, `pos_token`, plus user
// blobs), so sessions written by pre-kernel code remain valid with zero
// migration — no mass logout during rollout.
//
// Every mutation emits an AuthChangeEvent; apiFetch subscribes to invalidate
// request deduplication across auth transitions (login/logout/401-clear).

export type Realm = 'admin' | 'pos';

export interface AuthChangeEvent {
  realm: Realm;
  /** true when an access token exists for the realm after the change */
  authenticated: boolean;
}

export type AuthChangeListener = (event: AuthChangeEvent) => void;

const ACCESS_KEYS: Record<Realm, string> = {
  admin: 'sinaicamps_token',
  pos: 'pos_token',
};

const REFRESH_KEYS: Record<Realm, string> = {
  admin: 'sinaicamps_refresh_token',
  // Phase 5 parity: POST /api/pos/auth/refresh issues a refresh token.
  pos: 'pos_refresh_token',
};

const USER_KEYS: Record<Realm, string> = {
  admin: 'sinaicamps_user',
  pos: 'pos_user',
};

/** Legacy key names kept exported so tests and back-compat imports stay stable. */
export const TOKEN_KEY = ACCESS_KEYS.admin;
export const REFRESH_TOKEN_KEY = REFRESH_KEYS.admin;
export const POS_TOKEN_KEY = ACCESS_KEYS.pos;
export const USER_KEY = USER_KEYS.admin;

const listeners = new Set<AuthChangeListener>();

function read(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked/full — session stays memory-only until next write */
  }
}

function remove(keys: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

function emit(realm: Realm): void {
  const event: AuthChangeEvent = {
    realm,
    authenticated: Boolean(read(ACCESS_KEYS[realm])),
  };
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      /* a broken listener must never break the store */
    }
  });
}

export const session = {
  getAccessToken(realm: Realm): string | null {
    return read(ACCESS_KEYS[realm]);
  },

  getRefreshToken(realm: Realm): string | null {
    return read(REFRESH_KEYS[realm]);
  },

  setTokens(realm: Realm, accessToken: string, refreshToken?: string | null): void {
    write(ACCESS_KEYS[realm], accessToken);
    if (refreshToken !== undefined && refreshToken !== null && refreshToken !== '') {
      write(REFRESH_KEYS[realm], refreshToken);
    }
    emit(realm);
  },

  /**
   * Clear one realm's session (tokens + cached user), or every realm when
   * omitted. Emits one event per cleared realm.
   */
  clear(realm?: Realm): void {
    if (realm) {
      remove([ACCESS_KEYS[realm], REFRESH_KEYS[realm], USER_KEYS[realm]]);
      emit(realm);
      return;
    }
    const realms = Object.keys(ACCESS_KEYS) as Realm[];
    remove([
      ...realms.map((r) => ACCESS_KEYS[r]),
      ...realms.map((r) => REFRESH_KEYS[r]),
      ...realms.map((r) => USER_KEYS[r]),
    ]);
    realms.forEach(emit);
  },

  getUser<T = unknown>(realm: Realm): T | null {
    const raw = read(USER_KEYS[realm]);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  setUser(realm: Realm, user: unknown): void {
    write(USER_KEYS[realm], JSON.stringify(user));
  },

  onAuthChange(listener: AuthChangeListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
