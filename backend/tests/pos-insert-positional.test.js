/**
 * POS sale INSERT positional bind test (bind-swap fix, 2026-09-27).
 *
 * Root cause it pins: the sale INSERT in backend/src/routes/pos/index.js
 * carried the `'pending'` literal one VALUES slot too late — token 20 (`?`,
 * bound to `tipAmount || 0` NUMBER) sat at `kitchen_status` (TEXT enum with a
 * CHECK), token 21 (`'pending'` STRING) sat at `tip_amount` (REAL). Every POS
 * sale 500'd on staging with `CHECK constraint failed: kitchen_status ...`
 * (audit D.4) while the backend suite stayed green, for two compounding
 * reasons this file closes:
 *
 *  1. Phase-4 router fixtures stub `kitchen_status TEXT` WITHOUT the CHECK,
 *     so the wrong-type bind never fired in-suite.
 *  2. pos-transactions-schema.test.js rebuilds its probe INSERT from the
 *     column-name list (re-inlining `'pending'` at kitchen_status by NAME),
 *     so a VALUES-order swap in the real source never moved the probe.
 *
 * These 4 tests parse the ACTUAL statement + bind list out of the REAL source
 * file (no hand-duplicated SQL), then execute the verbatim shape against the
 * REAL migrated lineage (full migrate-all in better-sqlite3 :memory:, which
 * carries the 0004 CHECK and the 0100-series ALTERs through 0120 tip_amount):
 *
 *  Test 1 — placeholder-vs-bind count equality + literal-position proof.
 *  Test 2 — verbatim INSERT executes with no violation; row-back proves the
 *           enum slot holds a string and the tip slot holds a number.
 *  Test 3 — kitchen_status=0 (NUMBER) fires the real CHECK (constraint is live).
 *  Test 4 — the exact pre-fix swapped shape fails with the D.4 staging
 *           signature (mutation guard: this suite would have caught the bug).
 *
 * Pattern: better-sqlite3 :memory:, migrate-all in ledger order (proven by
 * pos-transactions-schema.test.js / schema-parity.test.js). FK enforcement
 * off: the probe asserts INSERT shape + CHECK, not the referential graph
 * (parent org/store rows are out of scope). No D1 apply, no source edits,
 * no KV writes.
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const migrationsDir = join(import.meta.dirname, '../migrations');
const saleSrcFile = join(import.meta.dirname, '../src/routes/pos/index.js');

// Fresh in-memory DB with the REAL migration lineage applied in ledger order
// (0001–0014 baseline + 0100-series ALTERs through 0120; 0109 reserved-absent).
function buildMigratedDb() {
  const db = new Database(':memory:');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) {
    db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
  }
  return db;
}

// Split on top-level commas: quote-aware (single/double/backtick, '' escape)
// and paren-depth-aware (datetime('now'), String(...), nested calls).
function splitTopLevel(s) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      cur += ch;
      if (ch === quote) {
        if (quote === "'" && s[i + 1] === "'") {
          cur += s[++i]; // '' escape inside string literal
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim() !== '') parts.push(cur.trim());
  return parts;
}

// Extract a balanced (...) group starting at the '(' index. Returns inner text.
function balancedInner(src, openIdx) {
  let depth = 0;
  let quote = null;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === quote && !(quote === "'" && src[i + 1] === "'")) quote = null;
      else if (quote === "'" && ch === "'" && src[i + 1] === "'") i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return src.slice(openIdx + 1, i);
    }
  }
  throw new Error('unbalanced parens parsing sale INSERT source');
}

// Parse the SALE site out of the real source: the INSERT INTO
// pos_transactions whose column list carries both kitchen_status and
// tip_amount. Returns { columns, valueTokens, bindArgs } — the verbatim
// shape the handler prepares + binds.
function parseSaleSite() {
  const src = readFileSync(saleSrcFile, 'utf8');
  const re = /INSERT INTO pos_transactions\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const colsInner = balancedInner(src, m.index + m[0].length - 1);
    const columns = splitTopLevel(colsInner);
    if (!columns.includes('kitchen_status') || !columns.includes('tip_amount')) {
      continue; // not the sale site — keep scanning
    }
    const afterCols = m.index + m[0].length + colsInner.length + 1;
    const valuesKw = src.indexOf('VALUES', afterCols);
    if (valuesKw === -1) throw new Error('VALUES clause not found after sale INSERT');
    const valuesOpen = src.indexOf('(', valuesKw);
    const valueTokens = splitTopLevel(balancedInner(src, valuesOpen));
    const bindKw = src.indexOf('.bind(', valuesOpen);
    if (bindKw === -1) throw new Error('.bind( call not found after sale VALUES');
    const bindOpen = src.indexOf('(', bindKw + '.bind'.length);
    const bindArgs = splitTopLevel(balancedInner(src, bindOpen));
    return { columns, valueTokens, bindArgs };
  }
  throw new Error('sale INSERT site (kitchen_status + tip_amount) not found in source');
}

const norm = (t) => t.trim().toLowerCase();
// 1-based ordinal of the Nth `?` token occupying valueTokens[idx].
function placeholderOrdinal(valueTokens, idx) {
  let n = 0;
  for (let i = 0; i <= idx; i++) {
    if (norm(valueTokens[i]) === '?') n++;
  }
  return n;
}

// Representative bind values keyed by column (mirrors the handler's runtime
// types: ids TEXT, money REAL, nullable TEXT/INT as null).
function bindFor(col, id, orderNo) {
  switch (col) {
    case 'id':
      return id;
    case 'tenant_id':
      return 't_pos';
    case 'organization_id':
      return 1;
    case 'store_id':
      return 1;
    case 'order_number':
      return orderNo;
    case 'cashier_id':
      return '7';
    case 'subtotal':
      return 100;
    case 'tax_amount':
      return 15;
    case 'tax_rate':
      return 0.15;
    case 'total_amount':
      return 115;
    case 'paid_amount':
      return 115;
    case 'payment_method':
      return 'cash';
    case 'notes':
      return null;
    case 'amount_cash':
      return 115;
    case 'amount_card':
      return 0;
    case 'idempotency_key':
      return null;
    case 'table_id':
      return null;
    case 'tip_amount':
      return 2.5;
    case 'project_id':
      return null;
    default:
      return 0;
  }
}

// Build the executable statement + binds from the PARSED shape. `overrides`
// maps column name -> { token, value } to mutate one slot (CHECK probes).
function buildStatement(columns, valueTokens, id, orderNo, overrides = {}) {
  const tokens = valueTokens.slice();
  const binds = [];
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    if (overrides[col]) {
      tokens[i] = overrides[col].token;
      if (norm(overrides[col].token) === '?') binds.push(overrides[col].value);
      continue;
    }
    if (norm(tokens[i]) === '?') binds.push(bindFor(col, id, orderNo));
  }
  return {
    sql: `INSERT INTO pos_transactions (${columns.join(', ')}) VALUES (${tokens.join(', ')})`,
    binds,
  };
}

describe('POS sale INSERT positional binds (bind-swap D.4)', () => {
  it('Test 1: placeholder count equals bind count, literals sit at the right slots', () => {
    const { columns, valueTokens, bindArgs } = parseSaleSite();

    // 24-column sale header contract (phase4f: project_id appended LAST).
    expect(columns.length).toBe(24);
    expect(valueTokens.length).toBe(columns.length);

    const placeholders = valueTokens.filter((t) => norm(t) === '?');
    // 19 `?` vs 19 bind args — a drift on EITHER side breaks loudly here.
    expect(placeholders.length).toBe(19);
    expect(bindArgs.length).toBe(placeholders.length);

    // The D.4 swap, pinned positionally: the token aligned with
    // kitchen_status must be the 'pending' literal (not a `?`), and the
    // token aligned with tip_amount must be a `?` (not the literal).
    const kitchenIdx = columns.indexOf('kitchen_status');
    const tipIdx = columns.indexOf('tip_amount');
    expect(kitchenIdx).toBeGreaterThan(-1);
    expect(tipIdx).toBe(kitchenIdx + 1);
    expect(norm(valueTokens[kitchenIdx])).toBe("'pending'");
    expect(norm(valueTokens[tipIdx])).toBe('?');

    // Value side: the `?` feeding tip_amount binds the tip variable (18th
    // placeholder), and project_id stays the LAST bind (phase4f contract).
    expect(bindArgs[placeholderOrdinal(valueTokens, tipIdx) - 1]).toMatch(/tipAmount/);
    const projectIdx = columns.indexOf('project_id');
    expect(norm(valueTokens[projectIdx])).toBe('?');
    expect(placeholderOrdinal(valueTokens, projectIdx)).toBe(bindArgs.length);
    expect(bindArgs[bindArgs.length - 1]).toMatch(/projectId/);

    // Surrounding literals untouched by the swap.
    expect(norm(valueTokens[columns.indexOf('status')])).toBe("'completed'");
    expect(norm(valueTokens[columns.indexOf('payment_status')])).toBe("'completed'");
    expect(norm(valueTokens[columns.indexOf('created_at')])).toBe("datetime('now')");
    expect(norm(valueTokens[columns.indexOf('updated_at')])).toBe("datetime('now')");
  });

  it('Test 2: verbatim INSERT executes clean; row-back proves enum-string vs number slots', () => {
    const db = buildMigratedDb();
    db.pragma('foreign_keys = OFF');
    const { columns, valueTokens } = parseSaleSite();

    const { sql, binds } = buildStatement(columns, valueTokens, 'txn_pos_1', 'POS-001');
    expect(binds.length).toBe(19);
    expect(() => db.prepare(sql).run(...binds)).not.toThrow();

    const row = db
      .prepare('SELECT * FROM pos_transactions WHERE id = ?')
      .get('txn_pos_1');
    // kitchen_status slot holds the enum STRING default ...
    expect(row.kitchen_status).toBe('pending');
    expect(typeof row.kitchen_status).toBe('string');
    // ... tip_amount slot holds a NUMBER, not the 'pending' string.
    expect(row.tip_amount).toBe(2.5);
    expect(typeof row.tip_amount).toBe('number');
    expect(row.total_amount).toBe(115);
    expect(row.status).toBe('completed');
    expect(row.payment_status).toBe('completed');
  });

  it('Test 3: kitchen_status=0 fires the real CHECK (constraint is live)', () => {
    const db = buildMigratedDb();
    db.pragma('foreign_keys = OFF');
    const { columns, valueTokens } = parseSaleSite();
    expect(columns).toContain('kitchen_status');

    // The exact D.4 failure mode: a NUMBER bound where the enum belongs.
    const { sql, binds } = buildStatement(columns, valueTokens, 'txn_pos_3', 'POS-003', {
      kitchen_status: { token: '?', value: 0 },
    });
    expect(() =>
      db.prepare(sql).run(...binds)
    ).toThrowError(/CHECK constraint failed.*kitchen_status/);
  });

  it('Test 4: pre-fix swapped shape fails with the D.4 staging signature', () => {
    const db = buildMigratedDb();
    db.pragma('foreign_keys = OFF');
    const { columns, valueTokens } = parseSaleSite();

    // Reconstruct the pre-fix SQL verbatim: kitchen_status <- ? (=0),
    // tip_amount <- 'pending' literal. Must 500 exactly as staging did.
    const { sql, binds } = buildStatement(columns, valueTokens, 'txn_pos_4', 'POS-004', {
      kitchen_status: { token: '?', value: 0 },
      tip_amount: { token: "'pending'" },
    });
    expect(norm(sql)).toContain('?');
    let err = null;
    try {
      db.prepare(sql).run(...binds);
    } catch (e) {
      err = e;
    }
    expect(err, 'pre-fix swapped shape must violate the CHECK').not.toBeNull();
    expect(String(err && err.message)).toMatch(/CHECK constraint failed.*kitchen_status/);
  });
});
