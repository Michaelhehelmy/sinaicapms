-- Migration 0001: initial monitor database schema (campmaster-monitor-db).
--
-- WHAT: three tables for the standalone monitor worker —
--   checks (one row per probe run per target),
--   reports (error/feedback reports collected from users),
--   alert_state (per-target alert/dedup state for cron evaluation).
--
-- NOTE (spec deviation, recorded in AGENT_LOGBOOK): no mission file with
-- exact DDL exists in-repo (same finding as mon-a1-scaffold). The `checks`
-- shape below is pinned by monitor/src/db.js queries (MAX(id) per target,
-- target/status_code/ok/response_ms/error_message/checked_at columns,
-- checked_at defaulting to datetime('now')); `reports`/`alert_state` are
-- minimal shapes for the A.3/A.4 intake + alert work.
--
-- Validation is LOCAL ONLY: sqlite3 :memory: apply (never --remote,
-- no d1 apply/create).

CREATE TABLE checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target TEXT NOT NULL,
  status_code INTEGER,
  ok INTEGER NOT NULL,
  response_ms INTEGER NOT NULL,
  error_message TEXT,
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_checks_target_checked ON checks (target, checked_at);

CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  page_url TEXT,
  contact TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_reports_status_created ON reports (status, created_at);

CREATE TABLE alert_state (
  target TEXT PRIMARY KEY,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  alerting INTEGER NOT NULL DEFAULT 0,
  last_alert_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
