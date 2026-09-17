# Q10 Resolution (B3 addendum to FINAL_IMPLEMENTATION_PLAN_v3.md)

**Parent task:** v3 §8 Owner Questions — **Q10** (keep or revert A22's F-A11-1 fix + tests)
**Date:** 2026-09-16
**Author:** Orchestrator (direct code review — no subagents, per owner hold)
**Owner pre-decision:** "Keep both code + tests as one logical change" — but ONLY after this code review. This document is that review.

---

## 1. The change under review

- **Code fix:** `backend/src/api/orders.js:979-989` (12 lines added inside `PATCH /:id/checkin`)
- **Tests:** `backend/tests/orders-unit.test.js:1414-1478` (55 lines, `describe('PATCH /orders/:id/checkin (A22-01 cross-tenant room guard)')`, 3 `it` blocks)
- **Verified green:** `cd backend && npx vitest run tests/orders-unit.test.js` → **96 passed** (2026-09-16); full backend suite **2158/2158** (fresh run 2026-09-16)

---

## 2. Full diff (verbatim)

```diff
--- a/backend/src/api/orders.js
+++ b/backend/src/api/orders.js
@@ -976,6 +976,18 @@ ordersRoutes.patch('/:id/checkin', async (c) => {
       if (available) assignedRoomId = available.id;
     }
 
+    // A22-01 fix: the resolved room (body room_id or order's existing room)
+    // must belong to THIS tenant's projects — otherwise a tenant admin could
+    // mark any other tenant's room occupied (cross-tenant room takeover).
+    if (assignedRoomId) {
+      const ownedRoom = await c.env.DB.prepare(
+        `SELECT rn.id FROM rooms_new rn
+         JOIN projects p ON rn.camp_id = p.id
+         WHERE rn.id = ? AND p.tenant_id = ?`
+      ).bind(assignedRoomId, tenantId).first();
+      if (!ownedRoom) return errorResponse('Room not found', 404);
+    }
+
     const updateParts = ['early_checkin = ?', 'adult_count = ?', 'child_count = ?', 'updated_at = datetime(\'now\')'];
     const updateParams = [early_checkin ? 1 : 0, adult_count || 1, child_count || 0];
     if (assignedRoomId) {
       updateParts.push('room_id = ?');
       updateParams.push(assignedRoomId);
     }
     updateParams.push(tenantId, orderId);
     // ... (batch: UPDATE orders SET ... WHERE tenant_id = ? AND id = ?, then
     //      UPDATE rooms_new SET status='occupied' WHERE id = ? — the second
     //      statement runs ONLY inside this route, after the ownership gate)
```

**Where the fix sits in the request flow** (context lines, `orders.js:946-1002`):

```
patch('/:id/checkin'):
  tenantId = getScope(c).tenantId            // tenant context (JWT-scoped; super_admin acts on chosen scope)
  if (!tenantId) → 401
  orderId = param
  { early_checkin, adult_count, child_count, room_id } = body
  order = SELECT id, room_id, camp_id FROM orders WHERE tenant_id = ? AND id = ?   // tenant-scoped lookup
  assignedRoomId = room_id || order.room_id
  if (!assignedRoomId) → atomic available-room find (tenant-scoped NOT EXISTS, orders.js:960-978)
  ⟪ NEW GATE (979-989): ownership check on assignedRoomId ⟫
  UPDATE orders SET … WHERE tenant_id = ? AND id = ?
  if (assignedRoomId) UPDATE rooms_new SET status='occupied' … WHERE id = ?
```

---

## 3. Review checklist (owner B3 items)

### (1) Tenant_id filter present — ✅ YES

The gate queries `WHERE rn.id = ? AND p.tenant_id = ?` — the room row is joined to its project (`projects p ON rn.camp_id = p.id`) and the tenant filter binds the **same `tenantId`** the rest of the route already uses. Two defenses in one:

- `rn.id = ?` rejects unknown rooms (404) — including pre-poisoned rows whose `room_id` points at a foreign room.
- `p.tenant_id = ?` rejects rooms belonging to any *other* tenant's project.

The subsequent `UPDATE rooms_new SET status='occupied' … WHERE id = ?` (line 1009) is therefore unreachable for foreign rooms. Verified by test 1's SQL assertion: `sqls.some(s => s.includes("UPDATE rooms_new SET status = 'occupied'")) === false` for a foreign room.

### (2) Super_admin not broken — ✅ YES (no regression)

- The gate uses the **same `tenantId`** as the pre-existing tenant-scoped lookups in the route (`SELECT … FROM orders WHERE tenant_id = ? AND id = ?` at line 956). Whatever scope a `super_admin` chooses via the request context (header/hostname/`?tenantId=` override), the gate checks ownership **within that same scope**.
- The fix adds NO new authority check: a `super_admin` scoped to tenant-A can still flip any room whose project belongs to tenant-A. The only thing now impossible is flipping a room that does **not** belong to the caller's scope — which is precisely the vulnerability being closed (F-A11-1) and matches sibling behaviour (item 3).
- No `role`/`is_active` logic was added or changed; `requireAuth`/`resolveScope` flow is untouched.

### (3) Sibling tenant-scoped patterns in orders.js — listed

The fix is **consistent with the established sibling patterns** in the same file:

| Pattern | Line | Shape |
|---|---|---|
| Order write scoped | 487 | `UPDATE orders SET order_state_id = ? … WHERE tenant_id = ? AND id = ?` |
| Order write scoped | 883-897 | `UPDATE orders SET … WHERE tenant_id = ? AND id = ?` (payment update) |
| Room-release guarded | 411-415 | `UPDATE rooms_new SET status='available' … WHERE tenant_id = ? AND room_id IN (…) AND id NOT IN (…)` |
| Room-release guarded (0067) | 504-508 | `UPDATE rooms_new SET status='available' … WHERE tenant_id = ? AND room_id = ? AND id != ? AND order_state_id != 'cancelled'` |
| Room ownership for availability | 223 / 392 | NOT EXISTS + room lookup both bind `tenant_id = ?` |
| **NEW gate (A22)** | **979-989** | `JOIN projects … WHERE rn.id = ? AND p.tenant_id = ?` — the only room-claim UPDATE that previously lacked a tenant filter (997) now has one |

The pre-fix checkin was the **last** `UPDATE rooms_new` without a tenant-boundary check; the fix brings it into line with every sibling.

### (4) All callers checked — ✅ YES

| Caller | Result |
|---|---|
| Unified frontend `app/src` (api.ts, admin panels, POS views) | **No caller exists** for `PATCH /api/orders/:id/checkin` (grep across `app/src` finds zero `…checkin` endpoint references; only `checkIn`/`check-in` field names) |
| Backend unit/regression tests | 96 passed in `orders-unit.test.js` incl. the 3 new A22 tests |
| POS integration `/api/pos/…` | Separate route family (`routes/pos/`); block/check-in flows there use their own tenant-scoped logic — unaffected |
| External/legacy consumers | None recorded; the route is reachable only by a bearer token scoped to a tenant (or super_admin scope) |
| `reservations.js` booking flow | Creates orders directly; does not call this PATCH — unaffected |

**Conclusion on callers:** because the route has **zero current frontend callers**, tightening it cannot break any shipping UI flow. The only behavioural surface changed is the API contract of an endpoint with no consumer — making 404-on-foreign-room a safe tightening.

### (5) No bulk / sibling-derivative endpoint exists — ✅ YES

The checkin room-claim write has **no bulk variant** and no concurrent sibling surface that could bypass the gate:

| Check | Result |
|---|---|
| Bulk endpoints in the orders family | Only `POST /api/orders/bulk-delete` (`orders.js:383`, registered `registry.js:1003`) — pure row delete; never touches `rooms_new` status or checkin logic |
| Bulk room-status / checkin routes | None — `registry.js` grep for `checkin|check_in|/checkout|room_status` returns only a comment (line 263); no route registered |
| Course-status bulk update | `orders.js:1075` bulk-updates `order_items.kitchen_status` only — unrelated to room occupancy |
| All `rooms_new.status` mutation sites | 6 in the codebase (occupied 1009, reserved 33, available 411/504/933/1043 + camps.js collateral 824/884/930); every site except 1009 is already tenant-scoped, and 1009 now is too |

**Conclusion:** the gate is the *only* path that flips `rooms_new.status` to `occupied` for checkin, so no bulk/import path bypasses it (tenant import writes rooms via the guarded `rooms_new` INSERT…SELECT and never mutates status).

---

## 4. Test bodies (verbatim, 3 tests)

From `backend/tests/orders-unit.test.js:1414-1478` — the `describe` block `PATCH /orders/:id/checkin (A22-01 cross-tenant room guard)`:

```js
it('rejects a room_id from another tenant with 404 and never flips room status', async () => {
  const sqls = [];
  const { db } = makeDbMock();
  const fn = chainMock([
    // order lookup (own tenant) succeeds
    (ch) => { ch.first.mockResolvedValue({ id: 'o1', room_id: 'room-own', camp_id: 'c1' }); },
    // ownership check: JOIN projects fails → room is NOT in this tenant
    (ch) => { ch.first.mockResolvedValue(null); },
  ]);
  db.prepare.mockImplementation((sql) => { sqls.push(sql); return fn(); });
  const req = makeRequest('PATCH', 'https://x.com/api/orders/o1/checkin', { room_id: 'room-foreign' });
  const res = await handleOrdersRoute(req, { DB: db }, TENANT);
  expect(res.status).toBe(404);
  const body = await res.json();
  expect(body.error).toBe('Room not found');
  // The room-status UPDATE must NOT have been prepared for a foreign room.
  expect(sqls.some((s) => s.includes("UPDATE rooms_new SET status = 'occupied'"))).toBe(false);
  const ownershipSql = sqls.find((s) => s.includes('JOIN projects'));
  expect(ownershipSql).toBeDefined();
  expect(ownershipSql).toContain('p.tenant_id = ?');
});

it('rejects an order whose existing room_id is foreign (pre-poisoned row)', async () => {
  const sqls = [];
  const { db } = makeDbMock();
  const fn = chainMock([
    (ch) => { ch.first.mockResolvedValue({ id: 'o1', room_id: 'room-foreign', camp_id: 'c1' }); },
    (ch) => { ch.first.mockResolvedValue(null); },
  ]);
  db.prepare.mockImplementation((sql) => { sqls.push(sql); return fn(); });
  const req = makeRequest('PATCH', 'https://x.com/api/orders/o1/checkin', {});
  const res = await handleOrdersRoute(req, { DB: db }, TENANT);
  expect(res.status).toBe(404);
  expect(sqls.some((s) => s.includes("UPDATE rooms_new SET status = 'occupied'"))).toBe(false);
});

it('accepts a body room_id that belongs to the tenant and flips that room to occupied', async () => {
  const sqls = [];
  const { db } = makeDbMock();
  db.batch.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
  const fn = chainMock([
    (ch) => { ch.first.mockResolvedValue({ id: 'o1', room_id: 'room-own', camp_id: 'c1' }); },
    (ch) => { ch.first.mockResolvedValue({ id: 'room-own' }); },
  ]);
  db.prepare.mockImplementation((sql) => { sqls.push(sql); return fn(); });
  const req = makeRequest('PATCH', 'https://x.com/api/orders/o1/checkin', { room_id: 'room-own', early_checkin: true, adult_count: 2 });
  const res = await handleOrdersRoute(req, { DB: db }, TENANT);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(sqls.some((s) => s.includes("UPDATE rooms_new SET status = 'occupied'"))).toBe(true);
});
```

| Test | Purpose | Covers checklist item |
|---|---|---|
| #1 | Foreign body `room_id` → 404, room UPDATE never prepared, JOIN has `p.tenant_id = ?` | (1) tenant filter, (3) sibling pattern, (4) no false flips |
| #2 | Pre-poisoned row (`order.room_id` foreign, empty body) → 404, no room flip | (1) defenses the existing-row path too |
| #3 | Same-tenant body `room_id` → 200, room flipped | **(2) non-regression for legitimate flow** |

---

## 5. Risk review (what could go wrong if kept)

| Risk | Likelihood | Mitigation / notes |
|---|---|---|
| Performance: 1 extra indexed SELECT per checkin | Negligible | `rooms_new` has `idx_rooms_new_camp` + tenant indexes; single-row `first()` lookup |
| False 404 for rooms whose `camp_id` is not in `projects` | Low | `rooms_new.camp_id` FK to projects is enforced by schema; A1 orphan checks (O1) show no orphan rooms |
| Atomics break: the gate runs before `batch()` | None | Gate is a read; the existing DB `batch` still commits order+room atomically afterwards |
| Super_admin loss of cross-tenant room flips | **By design** | That capability was the F-A11-1 vulnerability; sibling patterns already forbid it |
| Test-maintenance burden | Minimal | 3 focused tests, mock-based, 207 ms suite runtime |

---

## 6. Deliberate-scope note

The fix's 404 message ("Room not found") intentionally matches the existing 404 the route returns for a missing order — it does not reveal cross-tenant existence (no oracle for room enumeration). This is consistent with the sibling patterns (same terse error style) and was asserted in test #1.

---

## 7. Recommendation

**KEEP code + tests together (owner's pre-decision confirmed by review).**

- Checklist: (1) tenant filter present ✅ · (2) super_admin not broken ✅ · (3) consistent with 6 sibling tenant-scoped patterns ✅ · (4) zero frontend callers → no UI regression surface ✅ · (5) no bulk/sibling-derivative endpoint exists ✅.
- The fix closes the only runtime-confirmed P0/P1 cross-tenant write in the audit; reverting reopens it.
- Commit path: this stays **unstaged/uncommitted** until the owner answers Q10 affirmatively, per the tree freeze (§8.1 / owner 2026-09-16). On approval it lands as part of Wave 3a (F-A11-1) with its tests (total: +3 tests, suite still 2158-green expectation).

---

## 8. Change log / provenance

- Read-only review; no commits, no deploys, no subagents.
- Evidence: `git diff backend/src/api/orders.js`, `backend/tests/orders-unit.test.js:1414-1478`, fresh test run (96 passed), grep of `app/src` for callers, registry/orders bulk-endpoint greps (item 5).
- Files touched by the addendum bundle: this file, `A1-full-report.md`, `A22-probe-forensics.md`, `A1-proposed-0100-0101.md`, `FINAL_IMPLEMENTATION_PLAN_v3.md` (B-correction edits), `AGENT_LOGBOOK.md` (log entry).