---
task_id: t11-rtl-cancelled
parent_task: Implement all remaining backlog (T11 tenant zone RTL)
created: 2026-08-12
status: cancelled
category: frontend
---

# Tmp Agent: T11 — Tenant zone RTL support (CANCELLED — product decision)

## Objective
NONE — this task is cancelled.

## Rationale (verified during orchestration recon, 2026-08-12)
- `app/src/i18n/` does NOT exist; no `en.json`/`ar.json`, no `useI18n` hook, no locale middleware, no `sc_lang` cookie.
- `tests/e2e/specs/tenant/arabic-rtl-deep.spec.ts` is misnamed — it asserts **English LTR** behavior and its own comment states: "Frontend is hard-coded English LTR — pages must render en/ltr without relying on any client-side language setting."
- `PublicLayout.astro` hard-codes `<html lang="en" dir="ltr">`.
- Implementing RTL would contradict the passing E2E suite (552 passed in the verified gate run, including this spec).

## Decision
RTL/localization is out of scope for the current sprint — hard-coded English LTR is a deliberate product decision enforced by E2E. If RTL is ever wanted, it must be a new feature with its own i18n system + updated E2E specs. Recorded in AGENT_LOGBOOK.md (2026-08-12).
