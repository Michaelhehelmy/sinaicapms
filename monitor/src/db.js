// D1 helper stub (A.1 scaffold) — full persist/query logic lands in A.3/A.4.
export async function recordCheck(env, row) {
  if (!env?.DB) throw new Error('recordCheck: missing D1 binding env.DB (stub)');
  return { ok: false, stub: true, row };
}
