# Backlog: Void/Refund Next-Cycle Proposal

Status: proposal only — no code changed.

## Current
- `POST /api/pos/orders/:id/void` exists (manager-gated, stock restore, audit).
- No partial refund, no Paymob refund call, no `refunds` ledger table.
- Booking-order tips persist (`PATCH /api/orders/:id/tip`); POS tips receipt-only.

## Next cycle
1. `refunds` table (order_id, amount, reason, actor, created_at) + `POST /api/orders/:id/refund` (admin/manager, amount ≤ paid, idempotent key).
2. Paymob refund path behind `PM_ENABLED=true` only; mock path stays 501.
3. POS tip persistence: add `tip_amount` to `pos_transactions` via migration + backfill 0, surface in reports.
4. E-wallet/Instapay live only after ledger + webhook HMAC coverage; docs already mark planned-not-live.

## A11y / Perf notes
- F-A19 / F-A20 IDs do not exist in repo (DEEP_AUDIT uses C/W scheme) — no per-component commits to make.
- Island discipline recorded in ARCHITECTURE.md (4 islands, prefer `client:visible`).
