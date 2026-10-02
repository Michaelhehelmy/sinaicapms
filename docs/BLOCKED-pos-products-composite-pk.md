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

## Constraints honoured

No `wrangler d1 *`, no `deploy.sh`, no staging/prod curl, no migration file
created, no source file edited. Local `better-sqlite3` against the repo's own
replayed DDL only. Reproduce with
`backend/tests/meals-tenant-composite-pk.test.js` §2 for the mechanism and the
commands in this file's Evidence section for the six-edge census.