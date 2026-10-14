# Discovery audit 2026-10-14 — 02-findings

Branch main @ 8d6e3ba (dirty: package.json/lock churn + untracked tmp files).
Method: 01-method.md. Evidence: 05-evidence/F-*.txt (raw outputs).
Every entry below carries LOCATION + REPRODUCTION + IMPACT + FALSIFICATION + SEVERITY.
Orchestrator re-verified ≥20% of each subagent's claims with fresh commands (see evidence);
the migration-integrity run was re-executed by the orchestrator (3 failed / 7 passed).

## F-01 — integration-tests CI job is RED on main (P1)

- LOCATION: tests/core/migration-integrity.test.js:27-35 (descriptive-names), :76-91 (DROP TABLE), :115-123 (sequential).
- REPRODUCTION: `npx vitest run --config vitest.integration.config.ts tests/core/migration-integrity.test.js` → `3 failed | 7 passed (10)` (re-ran 2026-10-14; evidence F-01).
- IMPACT: `ci.yml → integration-tests` runs this exact config, so every PR gets a red gate no code change caused; authors learn to ignore CI. Deploy bypasses it (F-02), so the red gate guards nothing.
- FALSIFICATION: ran twice (subagent) + once (orchestrator); failing names captured verbatim. Pure file-content assertions (no DB/server dependence). `git log --since=2026-10-06 -- tests/ backend/tests/ app/tests/ .github/workflows/` = empty → pre-existing red, not introduced by recent work. Tried to exonerate as environmental — failed: content checks only.
- SEVERITY: P1 — persistently red main-branch gate that blocks nothing normalizes red CI.

## F-02 — deploy.yml "Integration" runs the unit suite; post-deploy E2E can never fail (P1)

- LOCATION: .github/workflows/deploy.yml matrix (`Integration / working-directory: . / command: npx vitest run`); e2e-verify `|| echo "(non-blocking)"`. Root vitest.config.ts include `tests/unit/**` vs vitest.integration.config.ts (37 files).
- REPRODUCTION: `sed -n '20,60p' .github/workflows/deploy.yml` + `cat vitest.config.ts` (evidence F-02). No run needed — wrongness is in the command string.
- IMPACT: production deploys gate on backend-unit + frontend-unit + root-unit mislabeled "Integration". The 37-file integration suite (incl. F-01's 3 red assertions) never runs pre-deploy; smoke failure still deploys green. Integration coverage is advisory everywhere, mandatory nowhere. docs/04-testing/TESTING.md:231-246 compounds it by documenting only ci.yml + e2e.yml.
- FALSIFICATION: verified both root config include globs directly; verified TESTING.md names only ci.yml/e2e.yml (:232). Mutation reasoning: deleting tests/core/* keeps deploy.yml green (never reads them); deleting tests/unit/* changes the "Integration" label's behavior — proving the alias.
- SEVERITY: P1 — deploy-time gate does not test what its name promises.

## F-03 — migration 0127 committed but NOT applied; live code assumes the new shape (P1)

- LOCATION: backend/migrations/0127_meals_tenant_composite_pk.sql:4-10 (PENDING-APPLY header); consumers backend/src/api/meals.js:67,288,319, backend/src/api/admin.js:77.
- REPRODUCTION: `ls backend/migrations/*.sql | sort | tail -1` (= 0127) + `sed -n '4,10p' .../0127...sql` + `grep -rn "0127" backend/src/api/` (evidence F-03).
- IMPACT: any DB at the 0126-applied head 500s on meal insert paths (`foreign key mismatch — "meal_lang" referencing "meals"`, per 0127:43-47); cross-tenant duplicate meal ids still 409 until applied. Deploy-order hazard.
- FALSIFICATION: docs/07-data/migrations.md:75,114 explicitly states "head in tree 0127; head applied elsewhere"; file header self-declares NOT applied with owner apply command; `git log --oneline -3 -- backend/migrations/0127*` shows commit only. Apply is a remote-side wrangler command (forbidden to run) — not disproved.
- SEVERITY: P1 — user-visible 500/409 bounded by a documented owner command; no data loss.

## F-04 — GET /api/supply/boms N+1 read (P1)

- LOCATION: backend/src/api/supply.js:462-477 (`router.get('/boms')`), loop at :472.
- REPRODUCTION: `sed -n '462,477p' backend/src/api/supply.js` (evidence F-04): 1 BOM-list query + 1 `SELECT * FROM bom_lines WHERE bom_id = ?` per BOM, no IN() batching, no LIMIT.
- IMPACT: every tenant listing B BOMs pays B+1 sequential D1 round-trips on a billed Worker; tail latency scales linearly; worst for manufacturing tenants with dozens of BOMs.
- FALSIFICATION: checked same-file T19 fix (supply.js:598-603 uses IN()+batch) proving the pattern and the fix are adjacent; outer result uncapped (no LIMIT) so the "≤1 row in practice" exoneration does not hold structurally. Production row distribution not measured (read-only) — noted, does not defeat the code shape.
- SEVERITY: P1 — confirmed loop-awaiting-query on a list endpoint with proven adjacent fix.

## F-05 — sequential per-line INSERT awaits on 4 write paths (P1)

- LOCATION: backend/src/api/financials.js:290-296 (entry_lines), :370-377 (invoice_lines); backend/src/api/supply.js:369-375 (PO lines), :497-503 (bom_lines).
- REPRODUCTION: `grep -n "for (const line" backend/src/api/financials.js backend/src/api/supply.js` + seds (evidence F-05); each body is a lone `await ... INSERT ... .run()`, no DB.batch().
- IMPACT: N sequential D1 round-trips per multi-line document (latency ≈ N×RTT) plus non-atomic partial writes on mid-loop failure — slow + half-written journals/invoices/POs/BOMs for admin/accounting users.
- FALSIFICATION: contrasted with established batch idiom (`grep -rn "\.batch(" backend/src` — reservations, folios:215, tenant-import, supply.js:452,609). Zod max-length caps not checked (could bound N) — the atomicity half survives regardless.
- SEVERITY: P1 — write-path latency + atomicity on 4 sites; mechanical batch fix.

## F-06 — GET /api/camps unbounded fallback when ?limit absent (P2)

- LOCATION: backend/src/api/camps.js:205-221.
- REPRODUCTION: `sed -n '205,221p' backend/src/api/camps.js` (evidence F-06): `if (limit)` branch paginates; else falls to full `SELECT * FROM projects ...` (tenant) or cross-tenant `SELECT c.* ... GROUP BY c.tenant_id` with zero LIMIT.
- IMPACT: default frontend calls (no ?limit) force full-table scan + full toCamel + full JSON serialize per request; marketplace host worst (all active projects incl. JSON blobs). Pays under listing crawls / marketplace home load.
- FALSIFICATION: `grep -n "LIMIT ? OFFSET"` shows only the if-branch; caller-side `limit` usage in api.ts not audited — the unbounded branch is reachable by construction for any client omitting the param.
- SEVERITY: P2 — real unbounded-scan path with paginated alternative one branch above; needs a default cap.

## F-07 — hottest public GETs bypass cachedJsonResponse; Vary covers 1 of 3 dimensions (P2)

- LOCATION: backend/src/api/meals.js:84-96,100-112; meal-plans.js:17-45; marketplace.js:32-82,89-99,106-145,181-192; storefront.js:105-135,138-148,476-525 (all `jsonResponse`); response.js:64-76 (cachedJsonResponse), :72 (`Vary: x-tenant-id`); tenant.js:9, resolveScope.js:17,158 (hostname/query/header resolution).
- REPRODUCTION: `grep -rn "cachedJsonResponse" backend/src/api/meals.js .../marketplace.js .../storefront.js .../meal-plans.js` → zero (evidence F-07); positive hits only in camps/categories/meta/tenants/orders. `grep -rn "Vary" backend/src` → single hit.
- IMPACT: anonymous high-traffic surfaces (marketplace home, tenant profile, products/blog, meals) get `Cache-Control: no-store` — every view hits Worker+D1; edge caching unused where it helps most. Single-dimension Vary risks cross-host cache confusion on exactly the endpoints that should be cached wider (correctness, not just speed).
- FALSIFICATION: checked handlers are tenant/slug-keyed public reads, not per-user personalized; response.js:58-61 docstring itself lists products/meals/plans as intended users — the docstring defeats the "intentionally uncacheable" exoneration. Upstream header-normalization not found.
- SEVERITY: P2 — broad cheap win (header swap per GET) + cache-correctness caveat; header-only, no KV writes (free-plan quota unaffected).

## F-08 — refresh rotation without revocation; logout is a no-op (P2)

- LOCATION: backend/src/api/auth.js:235-245 (re-issue), :263-266 (logout `jsonResponse({success:true})`); pos mirror routes/pos/index.js:292-304.
- REPRODUCTION: `sed -n '235,270p' backend/src/api/auth.js`; `grep -rn "refresh_tokens\|revoke\|blacklist\|jti" backend/src/api/auth.js backend/src/middleware/` → jti only in stream tokens (evidence F-08).
- IMPACT: stolen refresh token (admin or POS) mints fresh access tokens until its own 7d exp even after victim re-login/refresh/logout; logout gives false confidence. Only `is_active` deactivation kills it.
- FALSIFICATION: searched for any revocation store (D1 table, KV entry, used-flag) — none; `git blame -L 232,245` confirms claim-spoof fix but no invalidation. POS comment itself admits "no revocation table yet". Not disproved.
- SEVERITY: P2 — extends any refresh theft into a guaranteed 7-day forgery window. (P1 denied: requires an initial token theft; not a leak by itself.)

## F-09 — inline-script fetch bypass + fragile window.__API_BASE bridge (P2)

- LOCATION: writers CampsSection.astro:186,190,191; readers MarketplaceHome.astro:247, CampsSection.astro:251,281,312, gallery.astro:141-182; hand-rolled base in contact.astro:132-133, sitemap.xml.ts:15.
- REPRODUCTION: `grep -rn "window\.__..." app/src` + `sed -n '125,140p' app/src/pages/contact.astro` (evidence F-09). `grep -n "__API_BASE" MarketplaceHome.astro` → consumer only, no assignment.
- IMPACT: contact-lead POST + public-tenant GETs bypass the unified client (auth header, base-url, error envelope) and duplicate the localhost/origin/sinaicamps.com tri-branch; MarketplaceHome renders `/tenants` against `undefined/tenants` if composed without CampsSection; gallery pollutes globals. Drift risk on API version/host change.
- FALSIFICATION: ±5-line reads confirm plain `<script>` assignments (not props); Paymob/SSE/reporter fetches excluded as intentional after reading bodies. Inline `<script>`/.ts contexts explain why `@/lib/api` isn't imported — mechanism, not exoneration.
- SEVERITY: P2 — fragile implicit contract on public/lead paths.

## F-10 — cashier_id TEXT NOT NULL with no FK, type-mismatched to pos_users.id INTEGER (P2)

- LOCATION: backend/migrations/0004_pos.sql:125 (pos_transactions.cashier_id), :219 (pos_shifts.cashier_id); parent pos_users.id INTEGER at :183.
- REPRODUCTION: `grep -n "cashier_id" backend/migrations/0004_pos.sql` + REFERENCES check + 0119 CAST workaround (evidence F-10).
- IMPACT: orphan cashier references unenforceable without a type migration; every join pays `CAST(pos_users.id AS TEXT)` (0119:43). Integrity gap with working workaround.
- FALSIFICATION: `grep -rn "staff_id" backend/migrations/*.sql` → comment-only (no such column — kills the naming-confusion variant); 0119 header explicitly confirms the TEXT type + CAST. No adjacent FK clause found.
- SEVERITY: P2 — integrity gap; fix needs a rebuild migration (out of scope).

## F-11 — escHtml ×4 with semantic drift (+ normalizeAssetUrl ×3) (P2)

- LOCATION: app/src/lib/utils.ts:3, backend/src/utils/response.js:108, MarketplaceHome.astro:201, CampsSection.astro:195.
- REPRODUCTION: `grep -rIn 'function escHtml' app/src backend/src` (evidence F-11) + body reads.
- IMPACT: DOM versions escape all entities via browser; regex/chained versions escape 5 chars — server vs client output can differ; three copies to patch on any XSS fix. Drift risk on a security primitive.
- FALSIFICATION: read all four bodies — same name/signature, different implementations; `toSnake` pair verified as documented mirror and excluded. Not disproved.
- SEVERITY: P2 — correctness-adjacent (escaping), not hygiene.

## F-12 — workers.uptime is epoch-ms rendered as days (P2)

- LOCATION: producer backend/src/api/admin-health.js:70 (`uptime: Date.now()`); consumer SystemHealthPanel.tsx:103 (`Math.floor(uptime / 86400_000)` + "d"); type api.ts:2707 (unitless).
- REPRODUCTION: seds + `node -e` divisor check (evidence F-12).
- IMPACT: ops health panel shows days-since-epoch (~20,000+d) instead of process uptime; misleads incident response.
- FALSIFICATION: no startTime/delta in admin-health.js:55-85; index.js:202 `uptime_ms` verified as a different, correct field (excluded). Divisor itself correct — the numerator is wrong.
- SEVERITY: P2 — wrong value on an ops surface; one-line fix (duration or rename to serverTime).

## F-13 — dead config knobs + bindings-comment gap (P3)

- LOCATION: .env.example:20-21 (RATE_LIMIT_WINDOW_MS/MAX), :29,32 (PUBLIC_STRIPE_KEY/URL); bindings comment (omits RATE_LIMIT_KV) vs backend/wrangler.toml:25-26 + rateLimit.js:192,195,202.
- REPRODUCTION: repo-wide greps → zero code readers for all four vars; base URL hardcoded (api.ts:34-35); live dials are envKey family (evidence F-13).
- IMPACT: dev sets dead knobs expecting effect (rate limiter silently ignores; client won't follow PUBLIC_API_URL); bindings auditor misses the KV that carries rate-limit writes.
- FALSIFICATION: widened beyond backend/src to all extensions + scripts + workflows; only carriers are .env.example itself + a 2026-09-06 note that already called two dead. PM_*/STOREFRONT absence left as hypothesis (may be deliberate secret-put hygiene).
- SEVERITY: P3 — config confusion on rate-limit/dev-boot paths; comment-only for bindings.

## F-14 — migration rerun hazards: 2 unsafe DROP TABLE + non-rerunnable ADD COLUMN (P2/P3)

- LOCATION: 0108_add_meals_project_id.sql:68 (`DROP TABLE _0108_project_guard`), 0115_rooms_new_tenant_not_null_fk.sql:108 (`DROP TABLE rooms_new`); 0100_add_project_id_nullable.sql:66-144 (15× ADD COLUMN) + 0101:32, 0102:31, 0103:34, 0121:43.
- REPRODUCTION: negative-grep for unsafe drops + `grep -rn "ADD COLUMN IF NOT EXISTS"` → 0 (evidence F-14; SQLite/D1 has no such syntax).
- IMPACT: 0115 aborts on DBs where rooms_new is absent (partial lineage/bootstrap reorder); any mid-file retry aborts `duplicate column name` → manual restore-from-backup. D1 atomicity contains blast radius to a failed migration.
- FALSIFICATION: full DROP grep → ~40 hits, all others IF EXISTS; 4 extra raw matches proven `--` comments by sed; 0100:38-41 self-documents single-apply; CREATE TRIGGER hazard disproved (DROP TRIGGER IF EXISTS precedes each) and not filed. Prior "6/20 unsafe" claims disproved down to 2.
- SEVERITY: P2 for the 0115 bare drop (breaks unattended bootstrap/retry); P3 for ADD COLUMN (documented, atomic-mitigated).

## F-15 — doc count slips: symbols-vs-functions, line count, two labels (P3)

- LOCATION: AGENTS.md:52 + API_CONTRACT.md:44 (287 "functions"); API_CONTRACT.md:44 + 02-api/README.md:19 + code-vs-docs.md:2723 (2,838 / 1-2838); TESTING.md:148-149 (POS_NAV :39-44); deploy.yml job name "Cloudflare Pages".
- REPRODUCTION: `grep -cE "^export (async )?function "` → 286 (24+262) + sole `export const API_BASE` :34 = 287 symbols; `wc -l api.ts` → 2837; `grep -n POS_NAV` → decl :38, entries :39-44; deploy.yml name vs Workers step (evidence F-15).
- IMPACT: phantom-missing-function on export diffs; line-range refs point 1 past EOF; Pages label misdirects next auditor about where the frontend ships. Cosmetic; counts otherwise verified healthy (migrations 40/0127, api 57, POS 10, hooks 5, admin 63/46, views 11, ui 20, rate 23+default, limiters 36 — all match).
- FALSIFICATION: re-ran counts twice; multiline-export theory checked (:30-40 single-line); trailing-newline theory checked (still 2837). Recent api.ts edits explain the 1-line shrink.
- SEVERITY: P3 — docs-only; zero behavioral consequence.

## Deliberately NOT filed (verified healthy)

- Tenant-id resolution bypass: requireAuth equality-check precedes resolveScope override; hint≠claim → 403. Nothing.
- JWT_SECRET fallback / secrets in repo / CORS truth / CSRF on uploads / upload content-type: all fail closed or absent. Nothing.
- OpenAPI drift: 128 createRoute == 88 paths / 128 methods; generator faithful to deliberately partial registry. Nothing.
- Coverage thresholds, E2E smoke=10-in-one-file, root 37 files, suite churn since 2026-10-06 (empty): all match. Nothing.
- Islands discipline (17 real vs 23 raw), nav/hooks/bundle, TEMP tables, GENERATED pos_users.name, sequence gaps 0109/0125, trigger loss: nothing.
