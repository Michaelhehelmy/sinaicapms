# FINAL IMPLEMENTATION PLAN v3 — Wave Plan, Acceptance Criteria & Risk Register

> **Split out of `FINAL_IMPLEMENTATION_PLAN_v3.md` on 2026-10-06** (docs-vault restructure).
> The owner-facing verdict tier (tree-state declaration, executive summary, findings register,
> D-verdicts, owner questions) stays in that file; this file carries the execution tier.

---

## 5. Wave Plan (restructured per owner: Waves 0 → 7)

### Dependency graph (owners & reviewers must read this first)

```
Wave 0    owner prerequisites ───────────────────────────────┐
Wave 0.5  verification ∩ quick fixes ────────────────────────┤
Wave 1    storefront critical (F-A4-1 + F-A13-2)             │ ← deploy gate G1
Wave 2    money path (F-A4-4 + F-A4-3 + F-A2-1 + Q4 tip)      │ ← deploy gate G2
Wave 3    auth + security (F-A11-1 decision → Wave 3a)       │ ← deploy gate G3
Wave 4    4a-4i CI + observability ──────────────────────────┤
Wave 5    contract + dead code (A9 mapping + F-A9-04)         │
Wave 6    6a per-wave docs, 6b final truth sweep              │
Wave 6.5  staging validation                                  │ ← deploy gate G6.5
Wave 7    future + product backlog                            │
```

**Deploy gates (owner §7, applied verbatim):**
1. **Wave 1** ships (F-A4-1 + F-A13-2) — storefront functional again
2. **Wave 2** ships (F-A4-4 + F-A4-3 + F-A2-1)
3. **Wave 3** ships (F-A11-1 + F-A8-1/2)
4. **Wave 6.5** staging validation passes

`wrangler login` is an **owner prerequisite**, not a gate.

### Wave 0 — Owner prerequisites (owner acts; orchestrator coordinates)

| # | Task | Owner dependency |
|---|------|------------------|
| 0.1 | Confirm receipt of v3 + approve tree freeze lift | owner |
| 0.2 | *wrangler login* (owner's account) before any deploy | owner |
| 0.3 | Answer Q1, Q2, Q5, Q7, Q9 (approved 2026-09-16) + Q10 (pending B3 review) | owner |
| 0.4 | Lock stating v3 is the controlled baseline for Waves | orchestrator |

### Wave 0.5 — Pre-Flight (baseline + schedule; contains the one pre-flight code change 0.5.4, per owner §4.5)

| # | Task | Done condition |
|---|------|----------------|
| 0.5.1 | Re-run full backend suite (2158) + frontend (3363) + integration (255) in controlled order | all green |
| 0.5.2 | Run the **full E2E marketplace subset** (22) as the only E2E run this cycle | 22 green |
| 0.5.3 | Decide **F-A10-1 commit**: apply or revert test-only fix per owner | tree clean |
| 0.5.4 | **Migration cap**: raise to 200 in `migration-integrity.test.js:110` (pre-decided owner 2026-09-16) | cap raised, migration-integrity green |
| 0.5.5 | Baseline `tsc` (8 pre-existing errors documented, no new errors) | 8 baseline |

### Wave 1 — Storefront critical (deploy gate G1)

| ID | Task | Done condition |
|----|------|----------------|
| 1.1 | F-A4-1: fix `storefront.js:195` (`price` → `selling_price`) | integration test passes for storefront cart GET |
| 1.2 | F-A13-2: extend public scope to cart/checkout POSTs | anonymous cart POST works (401 → 200) + test |
| 1.3 | **Rollback**: pin Worker version at deploy; `./deploy.sh --rollback` returns to pre-Wave-1 version | documented + dry-run on staging |
| 1.4 | **Feature flag**: `STOREFRONT_CART_ENABLED` (env default off → Wave 1 turns on) | gate rendered off when false |
| 1.5 | **Monitoring**: structured `log()` for cart/checkout success+error (Wave 4i compatible) | 2 log lines added + test |

### Wave 2 — Money path (deploy gate G2)

| # | Task | Done condition |
|---|------|----------------|
| 2.1 | F-A4-4 payout `z.string()` + frontend type | admin payout 200 |
| 2.2 | F-A4-3 webhook amount/currency check | mismatch → log + not-paid |
| 2.3 | F-A2-1 8 catch-blocks 500 | unit test reaches 8 paths |
| 2.4 | Q4 tip: migration `0100_tip_amount.sql` + persist + reports | tip column + migration applied |
| 2.5 | F-A4-2 reservation double-count remove | integration test |
| 2.6 | F-A4-8 webhook select `tenant_id` | regression test |
| 2.7 | D19e: ledger states consistent after Wave 2 | unit + integration |

### Wave 3 — Auth + security (deploy gate G3)

| # | Task | Done condition |
|---|------|----------------|
| 3.0 | Owner decision: apply F-A11-1 fix now (recommended) or revert + Wave 3a ship | decision logged |
| 3.1 | F-A8-1/2 POS refreshToken + re-render | POS integration test |
| 3.2 | F-A3-2 derive `camp_id` from room row | unit + integration |
| 3.3 | F-A1-F001 pos-users org-scope | unit test |
| 3.4 | F-A16-02/03/04 SSE token + Last-Event-ID + counter | SSE integration test |
| 3.5 | ~~F-A22-02 tenant pivot verify + bind public reads~~ → **REMOVED (B5): verified intentional, P4, no bind needed** | audit verified → doc-only note in `.opencode/audits/2026-09-16/A22-probe-forensics.md` |
| 3.6 | F-A18-09 rate-limiter tenant-aware keys | unit test |
| 3.7 | F-A17-01/02 R2 cleanup + import rollback | integration test |

### Wave 4 — CI + observability (4a–4i)

| # | Task | Done condition |
|---|------|----------------|
| 4a | GitHub Actions: backend + frontend unit, coverage threshold (owner YES Q6) | CI green on PR |
| 4b | OpenAPI/`api-types.ts`/`api.ts` parity regen-diff check | CI fails on drift |
| 4c | deploy.sh `--rollback` + D1 backup size check | documented |
| 4d | dependency CVE audit | report |
| 4e | staging explicit routes + env.example no stale Stripe | docs fixed |
| 4f | migration consolidation policy (pre-decided: raise cap to 200; consolidation deferred to next cycle if ever needed) | cap raised + noted |
| 4g | **tsc gate to zero** (8 pre-existing errors) | CI typecheck green |
| 4h | astro build gate in CI + PERF_BASELINE refresh | CI green |
| 4i | **Observability**: structured logging, logpush, rollback trigger | logpush to target |

### Wave 5 — Contract + dead code

| # | Task | Done condition |
|---|------|----------------|
| 5a | F-A9-04: document frontend-consumed 235 routes via generator; F-A15-1 prune 69 dead `api.ts` exports | 235/235 documented |
| 5b | A9-D1/D2/D6 registry fixes + regen; F-A15-2/3/4/5 dead sharedAuth/softDelete/imports | regen clean |
| 5c | D1-D20 doc-truth fixes (per Wave 6a) | docs match |
| 5d | Contract test: 0 unresolved, 70 non-API named-10 | register clean |

### Wave 6 — Doc truth

| # | Task | Done condition |
|---|------|----------------|
| 6a | Per-wave doc fixes (per finding) | each doc matches |
| 6b | Final sweep: README, project-context, POLISH_PLAN §3.9/§3.10, QUICK_START, TESTING, API_SURFACE, MIGRATION_GUIDE, security-guide (F-A18-2/3/07 etc.), DEEP_AUDIT, DATABASE_SCHEMA_AUDIT | all crossed vs current baseline |

### Wave 6.5 — Staging validation (deploy gate G6.5)

| # | Task | Done condition |
|---|------|----------------|
| 6.5.1 | `./deploy.sh --staging` | staging up |
| 6.5.2 | Smoke all 5 surfaces (marketplace, tenant, admin, POS, stubs) | 22 marketplace + 5 surfaces |
| 6.5.3 | Full E2E suite on staging (owner notes ~552; reconcile with AGENTS.md ~929 claim) | consolidated number |
| 6.5.4 | Rollback drill on staging | works |

### Wave 7 — Future + product backlog

| # | Task | Done condition |
|---|------|----------------|
| 7.1 | Q9 PWA build (if YES) or demote POLISH_PLAN | decision applied |
| 7.2 | Q7 ewallet/instapay decide | docs fixed |
| 7.3 | Void/refund (deferred Q8) | next-cycle plan |
| 7.4 | A11 (check-in) + A19 (a11y batch) + A20 (perf islands) | per-item |

### Migration budget (through Waves 1-7)

| Use | Slots | Notes |
|-----|-------|-------|
| Current | 99 | head `0099` |
| Q4 tip (`0100_tip_amount.sql`) | +1 → 100 | within raised cap (200) |
| Future auth/SSE/logging | +2 → 102 | within raised cap |

**Cap policy (pre-decided, owner 2026-09-16 §4.3): raise `migration-integrity.test.js` cap from 100 → 200 in Wave 0.5. No owner decision required. F-A1-F003 gets NO migration (P4).**

---

## 6. Acceptance Criteria (owner §8 — "not worse than baseline − 0.5%")

Every wave must prove **no regression vs baseline** before the next wave starts. Baseline = the numbers in §2 Verified truths (current, fresh-run this session).

| Metric | Baseline | Wave gate | Fail threshold |
|--------|----------|-----------|----------------|
| Backend unit tests | 2158 / 83 files | every wave | any fail → do not proceed |
| Frontend unit tests | 3363 / 137 files | every wave | any fail → do not proceed |
| Root integration | 255 / 37 files | every wave (F-A10-1 re-run = 256 after fix) | any fail → do not proceed |
| E2E marketplace subset | 22 / 22 | every wave | any fail → do not proceed |
| Backend coverage | 86.77 / 76.30 / 92.88 / 91.64 | every wave | **below threshold pair** (83/72/89/89) → gate |
| tsc | 8 pre-existing errors | every wave | > 8 → gate |
| Bundle (A20) | PERF_BASELINE 4.2× | Wave 6/7 refresh | ≥ 5% worse than refreshed baseline |
| Doc truth | every claim matches baseline | 6a/6b | any false claim → gate |
| Deploy | staging green | 6.5 | any red → gate until fixed |
| Rollback | dry-run pass | 6.5.4 | fail → hold deploy |

**"Not worse than baseline − 0.5%"** applies to: test counts (no unexplained drops), coverage pair (no single-threshold drop), and bundle metrics once re-baselined at Wave 4h. Any wave that fails a gate is **returned** to the wave author; it is not silently merged.

---

## 7. Risk Register

| # | Risk | Likelihood | Impact | Mitigation | Owner action |
|---|------|-----------|--------|-----------|--------------|
| R1 | v3 plan itself becomes stale (v2 pattern) | High | Approval overhead | v3 is authoritative; logbook updated only after owner approval | Approve v3 as baseline |
| R2 | Deploy without owner `wrangler login` | n/a | Total deploy block | Wave 0.2 prerequisite documented | Run login |
| R3 | Migration cap raise (100→200) not yet applied in Wave 0.5 → Wave 2f tip migration blocked | Medium | Wave 2 delay | Wave 0.5.4 applies the pre-decided raise before Wave 2 starts | — |
| R4 | F-A11-1 fix rejected → cross-tenant check-in stays on prod | Medium | Tenant integrity | Q10 decision by Wave 3.0 | Answer Q10 |
| R5 | Storefront re-enabled without monitoring → silent cart 500s return | Medium | Repeat P0 | Wave 1.5 monitoring + Wave 4i logpush | — |
| R6 | Full E2E not run (only subset) → unseen regressions | High | Undetected | Owner explicitly accepted subset; Wave 6.5 full run; owner aware | Accept |
| R7 | ~~A22 probe environment unconfirmed (staging vs remote)~~ → **RESOLVED 2026-09-16 (B2): LOCAL wrangler dev, no remote write** | Low (none) | Evidence quality | Declared + forensics in `.opencode/audits/2026-09-16/A22-probe-forensics.md`; severity P0 rests on the static code path | Note |
| R8 | 0100/0101 reconstruction diverges from lost verbatim DDL | Low (never applied) | Migration drift | Reconstructed only; cross-checked vs current `rooms_new` schema | — |
| R9 | E2E count claims differ (AGENTS.md ~929 vs owner ~552) | Medium | Credibility | Reconciliation task in Wave 0.5.3/6.5.3 | — |
| R10 | Frontend "3419/132" stale doc claim leaks into docs again | Medium | Credibility | Removed from v3; Wave 6b sweep deletes it everywhere | — |
| R11 | KV quota (1,000 writes/day) exceeded if flag/logging writes added | High (free plan) | API outage | RATE_LIMIT_KV_ENABLED="false" retained; NO new KV writes; Wave 4i logpush via fetch, not KV | Monitor |
| R12 | Worker version pin conflict with `./deploy.sh` | Low | Rollback broken | 4c + 6.5.4 drill BEFORE production | — |
| R13 | F-A22-02 re-raised as a P2 by a future audit (anonymous public catalog pivot) | Low | Re-work / credibility | **Verified intentional (B5, 2026-09-16):** header tenant resolution is by design (`tenant.js:12`), authenticated cross-tenant pivots denied by JWT scope (`requireAuth.js:185-190`), public GETs expose only the whitelisted public catalog (`camps.js:224-247`); Wave 3.5 task removed; documented in `.opencode/audits/2026-09-16/A22-probe-forensics.md` | — |
