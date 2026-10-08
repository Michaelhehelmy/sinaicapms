---
title: "Monitor unit suite is red on main — six clock-coupled fixtures, not six code defects"
aliases:
  - monitor-suite-red
tags:
  - audit
  - domain/monitor
  - status/closed
  - kind/audit
created: 2026-10-06
updated: 2026-10-08
relates-to:
  - "[[code-vs-code]]"
  - "[[ARCHITECTURE]]"
  - "[[TESTING]]"
code-references:
  - "monitor/tests/api.test.js:180,304,368,454,466,1464 (the six failing assertions)"
  - "monitor/tests/api.test.js:473 (the NOW constant the fixtures should derive from)"
  - "monitor/tests/helpers/fake-r2.js:128 (HOUR_0 = 2026-10-03T00:12:00.000Z)"
  - "monitor/src/index.js:341-353 (newestRun two-day lookback)"
  - "monitor/src/index.js:495-505 (readHistoryWindow window filter)"
  - "monitor/src/index.js:1245-1250,1268 (report text is no longer server-escaped)"
  - "docs/01-architecture/ARCHITECTURE.md:184 (the Monitor unit row that cites 9e809bd)"
verified: 2026-10-08
---

# Monitor unit suite is red on `main` — six clock-coupled fixtures

## Verdict

**Six tests fail on `main` for one reason: their fixtures are stamped `2026-10-03` and the code they
read is stamped `now`.** The production code is correct in every one of the six cases. Nothing under
`monitor/` was edited by the gaps round-1 documentation work that found this, and nothing was edited
here — the fix belongs to the code workstream, which this mission may not touch.

Recorded as gap entry **`C‑7`** in [[code-vs-code]] · `Severity` **P2** · `Action` **`FIX-CODE/TEST`**
· deferred to **Wave 9**.

## Not caused by the documentation round

- `git diff 1616727..HEAD -- monitor/` — **empty**. The baseline `dee3124` (vault restructure) through
  the last documentation commit touches no monitor file.
- The only dirty monitor file is `monitor/package.json`: a devDependency bump
  `wrangler ^4.112.0 → ^4.144.0`. Left unstaged and unrelated — the failures reproduce without it,
  and they are deterministic (see below).
- Last commit to `monitor/` at all: `9e809bd` (`fix(monitor): remove self-check target`), whose own
  run recorded **191 passing**.

So the recorded baseline was true when written and stopped being true because **the calendar
moved**, not because the suite changed. That is the failure mode docs are supposed to prevent: a
number that reads as verified and is not.

## Reproduce

```
$ cd monitor && npx vitest run
 Test Files  1 failed | 6 passed (7)
      Tests  6 failed | 185 passed (191)
   Duration  970ms           exit 1

$ cd monitor && npx vitest run tests/api.test.js
      Tests  6 failed | 59 passed (65)
```

Deterministic: **four consecutive runs, byte-identical failure set.** No timing, ordering or
inter-test dependence — the same six named tests, every time.

## The six failures

| line | assertion | expected | got |
|---|---|---|---|
| `tests/api.test.js:180` | `expect(body.overall).toBe('ok')` | `ok` | `down` |
| `tests/api.test.js:304` | `expect(…targets.find(TARGETS[0]).up).toBe(false)` | `false` | `true` |
| `tests/api.test.js:368` | `expect(body.checks).toHaveLength(3)` | 3 | 0 |
| `tests/api.test.js:454` | `expect(body.checks).toHaveLength(288)` | 288 | 0 |
| `tests/api.test.js:466` | `expect(body.checks).toHaveLength(500)` | 500 | 0 |
| `tests/api.test.js:1464` | `expect(html).toContain('&lt;img src=x&gt;')` | escaped payload | absent |

## Mechanism

Every fixture instant in this suite is `2026-10-03` (`tests/helpers/fake-r2.js:128` exports
`HOUR_0 = new Date('2026-10-03T00:12:00.000Z')`; `tests/api.test.js:473` holds a matching
`NOW = '2026-10-03T12:00:00.000Z'`). Two production reads are stamped to the wall clock:

- **`newestRun(bucket, now = new Date())`** (`monitor/src/index.js:341-353`) scans **only today and
  yesterday** — `for (const daysAgo of [0, 1])` at `:342`. The lookback is deliberate and has its own
  passing test ("falls back to yesterday when today has no run yet"). A run object under
  `checks/2026-10-03/` is therefore **invisible from 2026-10-05 onward**.
- **`readHistoryWindow(env, target, hours, now = new Date())`** (`:495-505`) filters on
  `since = now − hours` (`:496`). Entries five days old fall outside every window the failing tests
  ask for.

That single cause produces all six symptoms: no run found → no target has a result → `upCount === 0`
→ `'down'` (`:180`); the missing row makes carry-forward answer the seeded `last_state === 'up'`
(`:304`); the ring window yields nothing (`:368`, `:454`, `:466`); and the probe-error card holding
the `<img src=x>` payload is never built, so its escaping guard has nothing to check (`:1464`).

## Confirmed, not inferred

The sibling tests that also read `new Date()` pin it — `vi.setSystemTime` appears **19** times in
`tests/api.test.js` (`:238`, `:271`, `:389`, `:491` and 14 more). The six failures are exactly the
ones that do not. Two independent confirmations:

1. Pinning the clock to the fixtures' own instant turns **all 65 tests green** — verified with a
   throwaway `/tmp` shim (`NODE_OPTIONS="--require …"`), not by editing the repo.
2. The six tests are precisely the set that omits `setSystemTime`; every test in the file that uses
   it passes.

The shim run emits one unrelated `STACK_TRACE_ERROR` inside vitest's runner (no assertion attached).
That is an artefact of monkey-patching the global clock from outside the test framework, not a
seventh defect — on the real clock the file is 6 failed / 59 passed and that test is green.

## The fix belongs in the tests

Pin the clock in these six the way their siblings do, or derive the fixtures from the existing
`NOW` constant at `tests/api.test.js:473` instead of literals in `fake-r2.js`.

**Do not widen `newestRun`'s two-day lookback, or `readHistoryWindow`'s window, to make the tests
pass.** Both are correct, both are documented in code, and both carry passing tests of their own.
Loosening either to accommodate a stale fixture trades a red suite for a monitor that reports a
five-day-old probe as current — a worse failure than the one being fixed.

## Two things the code workstream should know before "fixing" it

1. **One assertion in the set is currently vacuous.** `tests/api.test.js:1463`'s
   `expect(html).not.toContain('<img src=x>')` passes *because the card is missing*, not because
   escaping works. The guard only means anything once the run is found again.
2. **That test's title is stale.** "accepts session cookie too and escapes report content" — the
   payload is a probe `error_message`, not report content. Report text stopped being server-rendered
   (`monitor/src/index.js:1245-1250`) and is assigned as text nodes (`:1416-1428`); the neighbouring
   test at `:1401` already pins that. The cookie half of the test is fine and should stay.

## Doc impact

`docs/01-architecture/ARCHITECTURE.md:184` — the "Monitor unit" row cites `9e809bd` for **7 files /
191 tests**. Both counts remain exactly right; **only the verdict (`0 failed`) no longer holds**, so
the row gained a one-line note pointing here rather than a rewritten figure. Per the project rule, the
counts are not re-measured for a prose change and the suite is not re-run to fix a row.