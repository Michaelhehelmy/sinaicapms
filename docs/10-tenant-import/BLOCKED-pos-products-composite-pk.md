---
title: "BLOCKED — `pos_products` composite PK (parity D3, identifier half)"
aliases:
tags:
  - type/blocked
  - audience/owner
  - audience/developer
  - domain/tenant-import
  - domain/data
  - status/blocked
created: 2026-10-02
updated: 2026-10-06
relates-to:
  - "[[tenant-import]]"
  - "[[07-data/migrations]]"
  - "[[10-tenant-import/README]]"
  - "[[98-history/merged/audit-2026-10-02-tenant-import-edge-cases]]"
code-references:
  - "backend/migrations/0127_meals_tenant_composite_pk.sql"
  - "backend/src/api/tenant-import.js:369-372"
  - "backend/src/api/tenant-import.js:871"
  - "backend/src/api/tenant-import.js:876-878"
  - "backend/src/api/tenant-import.js:1007-1022"
  - "backend/src/api/tenant-import.js:1096-1118"
  - "backend/tests/tenant-import.test.js"
  - "backend/tests/tenant-import-identity.test.js"
  - "backend/tests/tenant-import-rollback.test.js"
  - "deploy.sh"
  - "backend/tests/meals-tenant-composite-pk.test.js"
verified: never
---
# BLOCKED — `pos_products` composite PK (parity D3, identifier half)

Status: **BLOCKED — documented only, no migration authored, no source edited**
(per tmp spec `.opencode/agents/tmp/2026-10-02-a3.md` item 2: "VERIFY FK
target consequence for `rooms_new.product_id` / `rate_plans_new.product_id`
BEFORE committing; if composite PK breaks single-column FKs, STOP this item
with a BLOCKED note (do not guess)").

Companion: `backend/migrations/0127_meals_tenant_composite_pk.sql` (item 1 of
the same mission) — the SAME idea applied to `meals`, where it **is** shippable.
The difference between the two is the `SET NULL` edge, and it is the whole
answer.

## Verdict

A composite `(tenant_id, id)` PK on `pos_products` **cannot** be landed without
either changing a documented `ON DELETE` action or silently breaking tenant
isolation. Every escape route was measured, not reasoned about.

## The six inbound FK edges (`PRAGMA foreign_key_list` over the full replay)

| child table | column | ON DELETE | composite edge possible? |
|---|---|---|---|
| `rooms_new` | `product_id` | `RESTRICT` | yes — `tenant_id` is `NOT NULL` (0115) |
| `rate_plans_new` | `product_id` | `CASCADE` | yes — `tenant_id` is `NOT NULL` |
| `pos_transaction_items` | `product_id` | `NO ACTION` | yes — `tenant_id` is `NOT NULL` |
| `pos_recipe_ingredients` | `product_id` | `NO ACTION` | yes — `tenant_id` is `NOT NULL` |
| `pos_recipe_ingredients` | `ingredient_id` | `NO ACTION` | yes — same row, both edges |
| `storefront_order_items` | `product_id` | **`SET NULL`** | **NO — see below** |

Five of six convert cleanly. The sixth does not, and it is decisive.

## Evidence (better-sqlite3, SQLite 3.45, the repo's own DDL shapes)

**1. The single-column edges break immediately.** SQLite accepts the DDL but
raises on the very first DML — not on a later, rarer code path:

```
rooms_new:       first INSERT -> foreign key mismatch - "rooms_new" referencing "pos_products"
rate_plans_new:  first INSERT -> foreign key mismatch - "rate_plans_new" referencing "pos_products"
```

This is the same mechanism item 1 documented for `meals`, and it is why a
one-table migration is impossible: a `REFERENCES pos_products(id)` edge cannot
resolve once `id` is no longer the PK.

**2. `storefront_order_items` has no `tenant_id` to key a composite edge on.**
Its live DDL is `id / order_id / product_id / product_name / quantity /
unit_price / total_price / created_at / project_id` — the tenant is reached
through `storefront_orders`, not carried on the line. The edge therefore cannot
be widened at all without first adding and backfilling a tenant discriminator,
and this is the newest edge in the schema (`0123`), which is why it is easy to
miss.

**3. Forcing the 2-column edge fires `SET NULL` on the WHOLE key.** SQLite has
no per-column `SET NULL`, so the action targets every column of the composite:

- `tenant_id NOT NULL` (the only sane choice for a discriminator) ⇒ the DELETE
  aborts. **Every product referenced by a storefront line becomes undeletable.**

  ```
  DELETE product -> NOT NULL constraint failed: storefront_order_items.tenant_id
  ```

- `tenant_id` nullable ⇒ the DELETE succeeds and the tenant is destroyed:

  ```
  after DELETE: [{"id":"so1","tenant_id":null,"product_id":null}]
  ```

  An order line now attached to **no tenant**. This is the worst outcome of the
  three: silent cross-tenant leakage into any read that filters by `tenant_id`,
  and it is exactly the "critical security failure" the AGENTS/safety rules
  single out.

**4. Downgrading the action does not rescue it.** `RESTRICT` (matching the five
other edges) is just a different way to make the product undeletable:

```
DELETE product -> FOREIGN KEY constraint failed
```

**5. The "obvious" workaround makes the migration a no-op.** Keeping the
single-column edges alive requires a `UNIQUE` index on `pos_products(id)`:

```
composite PK alone: cross-tenant dup id ACCEPTED (the goal)
+ UNIQUE(id):       UNIQUE constraint failed: pos_products.id
```

That forbids precisely the reuse the migration exists to permit. It would ship
a large, forward-only, restore-from-backup-only table rebuild in exchange for
the schema it already had.

## Why `meals` (item 1) is different, and this is not a judgement call

`meals` has exactly **two** inbound edges — `meal_lang` (CASCADE) and
`meal_schedules` (CASCADE) — and **no `SET NULL`**, so both convert to the
composite form with their actions preserved verbatim. `0127` rebuilds three
tables and changes no action, no column name, and no column position. The
asymmetry is entirely the `SET NULL` edge, which only `pos_products` has.

## What would unblock it (owner decision, deliberately NOT authored)

Any of these is a product/schema decision, not an implementation detail:

1. **Add `tenant_id` to `storefront_order_items`** (backfilled from
   `storefront_orders`), widen the edge, and **downgrade `SET NULL` to
   `RESTRICT`** — accepting that a product with storefront history cannot be
   deleted. Needs a product-soft-delete story (`pos_products.deleted_at` already
   exists and is used by every read path).
2. **Denormalise the order line**: copy `product_id` into a non-FK
   `product_id_snapshot` plus `product_tenant_id` and drop the FK entirely —
   the correct model for an order line (it should record what was sold, not
   reference a mutable catalogue row), but it changes the read path.
3. **Ship the rest and keep `pos_products.id` global.** Every writer already
   generates `prod_<uuid12>` when the manifest omits an id
   (`tenant-import.js`), so only an explicitly authored product id collides.

Option 3 is the status quo and is the honest default; the parity-D3 identifier
blocker is therefore **still open for `pos_products.id`** and should not be
reported as closed. `meals.id` is closed by item 1.

## Parity D3, identifier half — measured again 2026-10-02 (tenant-import edge-case matrix)

`0126` re-scoped `pos_products.sku` and `pos_users.email`/`username`. It deliberately did
**not** re-scope the two identifier primary keys (`pos_products.id TEXT PRIMARY KEY`,
`meals.id TEXT PRIMARY KEY`) — a PK cannot be re-scoped without rewriting every
`meal_lang` / `meal_schedules` reference.

Consequence, measured: **a manifest that ships explicit ids cannot be loaded into a
second tenant.** Step 5c returns `409 "One or more products already exist (duplicate SKU
or ID)"`, and the `meals` half already answers a clear `400` naming the meal and the id
(the `0126` probe). So the manifest *authoring* rule stands: strip tenant-local `id`s
before loading the same catalogue twice. Carried forward from parity finding D3, which
`0126` only partially closed.

## Identity-path rollback assessment — **SUPERSEDED, IT SHIPPED** (Wave 8 item)

> **Everything below §5 was written when the answer was "do not implement this",
> and that decision was overtaken.** The identity-path rollback **is implemented**
> and **is covered by tests**. Re-verified at HEAD:
>
> - `rollbackCreated()` is defined at `backend/src/api/tenant-import.js:1007` and
>   called at `:1099` (deliberate rejection), `:1103` (rolled-back failure) and
>   `:1118` (thrown error). The branch it lives in is
>   `if (result.status >= 400)` at **`:1096`** — not `:829-832`, which is now the
>   `pos_users` INSERT.
> - The undo log is threaded through `runImport`'s `created` out-parameter
>   (`:369-372`, documented at `:876-878`): every section pushes
>   `{ table, column: 'tenant_id', value }` AFTER its write succeeds, and the
>   route deletes them in reverse order.
> - Coverage exists in **two** suites that did not exist when §5.1 was written:
>   `backend/tests/tenant-import-identity.test.js` (9 tests, added `5df3ed2`
>   2026-10-02) — including **M5** "rolls the whole tenant back when the 5th
>   product fails on a duplicate SKU" and **S1/S2/S3**, which assert a deliberate
>   409, a guarded 404 and the schema 400 each keep their own status through the
>   undo; and `backend/tests/tenant-import-rollback.test.js` (4 tests, added
>   `3f66503` 2026-10-02) — **T1** "rolls the whole shell back to zero rows when
>   the data import fails in its last section", **T2** pre-write failure deletes
>   nothing, **T3** the existing-tenant branch never deletes and reports partial
>   data instead, **T4** the success path issues no DELETE.
> - The existing-tenant path still passes no log, so it can never delete a
>   pre-existing tenant's rows — the asymmetry §5 relied on is preserved on
>   purpose and is pinned by T3.
>
> **§5 is kept as the record that produced the fix.** Its reasoning about *why* a
> naive "delete just the tenant" try/catch was wrong was sound and is now the
> design: the rollback is a **reverse-order per-table tenant-scoped DELETE log**,
> each step in its own `try`/`catch` so a blocked step cannot hide the rest
> (`:1007-1022`), not a single transaction.
>
> **What is still true below:** the FK-ordering facts (§5.2's list) are real and
> are the reason the log exists; and "no D1 rollback was authorized" survives as
> the `importTenantManifest` docstring's account of the R2-only F-A17-02 scope —
> but it moved, and it now describes R2, not the identity saga.

**Original decision (2026-09-21, since implemented): do not implement the
identity-path try/catch rollback.** Both spec preconditions failed at the time,
and the second one was decisive.

### 5.1 Existing test coverage of the identity path is insufficient — **NO LONGER TRUE**

`backend/tests/tenant-import.test.js` **was** the only identity-path suite when this was
written (53 tests today, 16 then). It covers the happy path (201 + the created ids, the
tenant/admin/org/project INSERTs, the project-block reuse, the identity-strip) and every
**pre-provisioning** rejection (403 non-super-admin, 400 bad subdomain format / taken
subdomain / duplicate email / missing fields).

At the time nothing exercised the post-provisioning failure, because the branch did not
exist — `tenant-import.js:829-832` is now the `pos_users` INSERT and the real branch is
`:1096`. **The fixture asked for in §5.3 now exists**: a manifest that makes `runImport`
fail on the identity path is exactly what **M5** (5th product, duplicate SKU) and **T1**
(last section, `pos_users`) set up, and the deliberate-rejection paths have **S1/S2/S3**.

### 5.2 The change is not small — **and it was not small, which is why the undo is a log**

"Delete only the newly-created tenant" is not a small try/catch here. Every bullet below
turned out to be a real constraint on the shipped implementation:

- **D1 has no cross-request transaction.** Provisioning commits `tenants`, `admins`,
  the POS org + store + `tenant_org_mapping` (via `ensureTenantOrg`) and `projects` as
  four independent writes, and `runImport` then commits each section in its own
  `DB.batch`. A catch block cannot un-commit them.
- **The committed data rows are FK children of what you would delete.**
  `pos_products.project_id` / `rooms_new.project_id` / `rate_plans_new.project_id` /
  `meals.project_id` are `ON DELETE SET NULL`, but `pos_users` → `pos_organizations`,
  `rooms_new`/`rate_plans_new` → `projects` and `meal_lang` → `meals` are plain
  `RESTRICT`/`NO ACTION`. Deleting just the tenant row trips
  `FOREIGN KEY constraint failed`; deleting the whole set is a wide multi-table sweep
  over the same 9–10 tables the d4/d5 tests enumerate, each needing its own ordering.
- **That is exactly the surface F-A17-02 declined to authorise** — but the citation
  moved. `tenant-import.js:723-726` is now the `meal_categories` /
  `meal_categories_lang` INSERT build; the quote "Imported *rows* are not rolled back
  (the plan's 'or' option — two-phase upload-then-insert-with-cleanup — was chosen;
  **no D1 rollback was authorized**)" lives in the `importTenantManifest` docstring at
  **`:871`**, and it is accurate there: it scopes the **R2** rollback, which is real and
  limited to `MEDIA_BUCKET` keys. It is NOT a statement about the identity saga any more
  — the saga's D1 rollback is the undo log described above. **The existing-tenant path
  remains exactly as this bullet describes: rows are not rolled back.**
- **A partial rollback is worse than the honest orphan.** §3.2 shows the current residue
  is a clean tenant shell: an admin who retries with a fresh subdomain succeeds, and an
  admin who notices the orphan can delete one row. A rollback that deletes the tenant
  first and then fails open on the FKs would leave a half-deleted shell that is harder
  to reason about and impossible to retry.

### 5.3 Wave 8 item — **CLOSED**

> **Identity-path rollback on a post-provisioning failure.** ~~The
> `if (result.status >= 400)` branch at `backend/src/api/tenant-import.js:829-832` carries
> the comment *"If import returned an error response, clean up partial provisioning"*
> but performs **no cleanup**.~~ **Shipped.** The branch is at **`:1096`**, it performs
> the cleanup, and both halves of the required fix are in the tree: (a) the ordering
> requirement is met by the reverse-order `created[]` log rather than one `DB.batch`
> (a single batch cannot span the R2 uploads and `hashPassword` — that reasoning in the
> original item was right and is why the log is the shape it is), and (b) the fixture
> that "does not exist today" now exists and is pinned by **M5**, **S1–S3** and
> **T1–T4**.
>
> **Still open, and it is not this item:** `pos_products.id` remains the global text
> primary key, so parity finding **D3's identifier half is unclosed** (see § *Parity D3,
> identifier half* above). The rollback question and the composite-PK question are
> separate, and closing the first does not move the second.

---

## Constraints honoured

No `wrangler d1 *`, no `deploy.sh`, no staging/prod curl, no migration file
created, no source file edited. Local `better-sqlite3` against the repo's own
replayed DDL only. Reproduce with
`backend/tests/meals-tenant-composite-pk.test.js` §2 for the mechanism and the
commands in this file's Evidence section for the six-edge census.