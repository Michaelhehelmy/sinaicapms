---
title: "docs/05-operations — Operations"
aliases:
tags:
  - type/index
  - audience/owner
  - audience/developer
  - domain/operations
  - status/live
created: 2026-10-06
updated: 2026-10-06
relates-to:
  - "[[RUNBOOK]]"
  - "[[AUDIT_MASTER_FINDINGS]]"
  - "[[98-history/deploys/README]]"
  - "[[98-history/sessions/README]]"
code-references:
  - "deploy.sh"
  - "scripts/check-deploy-parity.sh"
  - "backend/wrangler.toml"
verified: never
---
# docs/05-operations — Operations

## Overview

Run the thing, and know what was found when. `RUNBOOK.md` is owner-facing and was rewritten
2026-10-02 against the live tree; treat a procedure here as executable only if it names a command
you could paste today.

## Concepts

- **Ownership first** — §1 is contacts, and it comes before the procedures because every step below
  it needs someone to authorise.
- **Environments and resource map** — which account, which Worker, which D1, which bucket, and the
  resource each of those lives in.
- **Pre-flight is read-only by default** — §3 changes nothing. Anything that mutates is opt-in.
- **Record BOTH version IDs after every deploy** — the backend Worker version and the frontend
  version. One of them is how you roll back; a half-recorded deploy is a half-rollback.
- **Smoke expects 200 from all five probes — `000` means the probe never landed,
  `500` means it landed and broke.** They are different failures with different
  owners. (It used to read "200 or a 400-guard"; `GET /api/me` is public by design —
  `backend/src/index.js:616-617` — so a `4xx` there is the surprise.)
- **Rollback only if smoke fails** — §6 is the ordered inverse of §4.
- **Backup, restore, drift** — §7 and §8: D1 restore is a real procedure, and drift detection is how
  you find out the live Worker is not the one in git.
- **The two incident families that actually happen** — §9a D1 free-tier quota exhaustion (two distinct
  limits, different remedies) and §9b Cloudflare auth failures, which start with `unset` and only then
  escalate to OAuth expiry and `fetch failed`.
- **The 24-hour watch window** — §10, because a deploy that passes smoke in the first five minutes is
  not a deploy that passed.

## Docs

| Doc | What it is |
|---|---|
| [[RUNBOOK\|RUNBOOK.md]] | **Owner-only procedures** — deploy, rollback, backup, drift, incident. Rewritten 2026-10-02 against the live tree. |
| [[AUDIT_MASTER_FINDINGS\|AUDIT_MASTER_FINDINGS.md]] | Consolidation index of the 2026-09-05 8-domain audit round. The round is archived; this index survives as its entry point. |

## Related

- [[README|docs/README.md]] — vault entry point
- [[QUICK_START]] — the setup path the runbook assumes
- [[ARCHITECTURE]] — §6 deployment, the shape the runbook operates on
- [[migrations]] — the schema changes the runbook applies during a deploy
- [[security-guide]] — the auth and rate-limit behaviour incidents surface
- [[TESTING]] — the suite run before the deploy this folder describes
- [[98-history/deploys/README]] · [[98-history/deploys/ASTRO_DEPLOY_CUTOVER]] · [[98-history/deploys/PROD-DEPLOY-CHECKLIST-2026-09-22]] — spent deploy records and the cutover checklist
- [[98-history/audits/README]] — the per-domain audit reports this folder's findings index consolidates

## Gaps

Audited 2026-10-06 against the tree, read-only. This folder's queued doc fixes:

- **[[code-vs-docs]]** — **8** `STALE`/`FALSE` claims, plus **14** `MATCHED` controls this folder's findings rest on. `MATCHED` entries are reproduced at the foot of that note, because a finding that quotes one of them is only auditable if it is readable there.
- **[[unverified]]** — **3** claims this folder states that the tree cannot answer · **[[unimplemented]]** — none.

Nothing is fixed yet. Each entry carries the `file:line` its claim was measured against and a named action; fix this folder's carriers together, not one file at a time — see [[99-gaps/README]] for the workflow.

