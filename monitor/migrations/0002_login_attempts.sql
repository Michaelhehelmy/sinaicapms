-- Migration 0002: login_attempts for the D1-backed PIN brute-force gate.
--
-- WHAT: one row per POST /login attempt (success + failure + rate-limited),
--   backing the 5-fails-per-5-minutes-per-IP gate in monitor/src/index.js.
--   success is 1 on correct PIN, 0 otherwise; ip is cf-connecting-ip only
--   (never x-forwarded-for); attempted_at defaults to datetime('now').
--   No PIN value or hash is ever stored — only the outcome bit.
--
-- NOTE (spec deviation, same class as 0001): no mission file with exact DDL
-- exists in-repo (grep over .opencode/ for login_attempts/DASHBOARD_PIN hits
-- only the tmp spec itself). Shape below is pinned by monitor/src/db.js
-- helpers (recordLoginAttempt INSERT, getRecentFailCount SELECT COUNT with
-- datetime('now', '-5 minutes') window, clearOldLoginAttempts DELETE with
-- datetime('now', '-1 hour')).
--
-- Validation is LOCAL ONLY: sqlite3 :memory: apply (never --remote,
-- no d1 apply/create).

CREATE TABLE login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  success INTEGER NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_login_attempts_ip_time ON login_attempts (ip, attempted_at);
