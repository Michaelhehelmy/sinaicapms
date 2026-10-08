---
title: "docs/06-security — Security"
aliases:
tags:
  - type/index
  - audience/developer
  - domain/security
  - status/live
created: 2026-10-06
updated: 2026-10-06
relates-to:
  - "[[security-guide]]"
  - "[[06-security/security-guide]]"
  - "[[98-history/audits/AUDIT_SECURITY_FINDINGS]]"
  - "[[98-history/audits/AUTH_SYSTEM_AUDIT]]"
code-references:
  - "backend/src/middleware/requireAuth.js"
  - "backend/src/middleware/rateLimit.js"
  - "backend/src/middleware/tenant.js"
  - "backend/src/index.js:147"
  - "app/src/lib/utils.ts:3"
  - "app/src/lib/routeZones.ts"
verified: never
---
# docs/06-security — Security

## Overview

Security architecture and the rules that follow from it. `security-guide.md` was refreshed
2026-10-02 and re-verified 2026-10-06, and records not only what the defences are but where the
escHtml verdict landed — a defence that is documented as "not used here" is a decision, and a
decision needs a record.

## Concepts

- **Authentication and token lifecycle** — JWT (HS256) bearer tokens, expiry and refresh, and the
  `env.JWT_SECRET` no-fallback rule: unset means auth throws immediately rather than degrading.
- **CSRF does not apply, and the reason matters** — auth travels in a header, not an ambient cookie,
  so a cross-site request carries no credential. §"Comparison: Cookie-based auth (risky)" is the
  counterfactual: if auth ever moves to cookies, this exemption is void.
- **XSS is four layers, and layer 2 is narrow on purpose** — React auto-escaping handles
  framework expressions; `escHtml()` is for raw-HTML pipelines ONLY and never in a JSX expression;
  Zod validates at the API boundary; there is deliberately **no scrub-on-write layer**. No
  scrub-on-write means every render path must be classified by hand.
- **Rate limiting fails closed** — KV-backed with an in-memory per-isolate fallback, and a KV error
  answers `429`, never an allow. The free-plan caveat is stated in its own subsection because the
  1,000-writes/day cap is an outage, not a tuning problem.
- **CORS is owned by exactly one place** — `hono/cors` in `backend/src/index.js`. Response headers
  elsewhere must not set CORS, or the two silently disagree.
- **No sanitisation middleware** — input handling is Zod at the boundary plus parameterized
  `.prepare().bind()` SQL. SQL injection is prevented by binding, not by escaping.
- **Recommendations and a verification note** — what is still open, and what was checked versus
  assumed, dated.

## Docs

| Doc | What it is |
|---|---|
| [[security-guide\|security-guide.md]] | **Canonical security architecture prose**, refreshed 2026-10-02 and re-verified 2026-10-06: auth (both POS credential paths), tenant isolation, the CSRF exemption and its limits, the rate-limit policy table, and where the escHtml verdict landed. |

## Related

- [[README|docs/README.md]] — vault entry point
- [[API_CONTRACT]] — the 401-vs-403 and response-envelope rules enforced here
- [[ARCHITECTURE]] — tenant isolation enforced on both sides of the same boundary
- [[RUNBOOK]] §9 — the auth-failure and rate-limit incident procedures
- [[98-history/audits/AUDIT_SECURITY_FINDINGS]] · [[98-history/audits/AUTH_SYSTEM_AUDIT]] — the archived audits behind the current state
- [[AUDIT_MASTER_FINDINGS]] — the P0 consolidation these two feed

## Gaps

Audited 2026-10-06 against the tree, read-only. This folder's queued doc fixes:

- **[[code-vs-docs]]** — **4** `STALE`/`FALSE` claims, plus **13** `MATCHED` controls this folder's findings rest on. `MATCHED` entries are reproduced at the foot of that note, because a finding that quotes one of them is only auditable if it is readable there.
- **[[unverified]]** — **1** claim this folder states that the tree cannot answer · **[[unimplemented]]** — **1** item of real code no doc here claims.

Nothing is fixed yet. Each entry carries the `file:line` its claim was measured against and a named action; fix this folder's carriers together, not one file at a time — see [[99-gaps/README]] for the workflow.

